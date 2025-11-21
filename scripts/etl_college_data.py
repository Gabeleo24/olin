import logging
import os
import sqlite3
import time

import pandas as pd
import requests

from config import get_env_var
from constants import CREDENTIAL_MAP, REGION_MAP

# Configuration
API_KEY = get_env_var("COLLEGE_SCORECARD_API_KEY", required=True)
BASE_URL = "https://api.data.gov/ed/collegescorecard/v1/schools"
DB_PATH = os.path.join(os.path.dirname(__file__), '../data/colleges.db')
BATCH_SIZE = 100  # Max allowed by API

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def get_field_mapping():
    """
    Returns the mapping of API fields to internal variable names
    as specified in the architectural document.
    """
    return [
        # Identity
        "id",
        "school.name",
        "school.school_url",
        "ope8_id",
        
        # Student Body
        "latest.student.size", # UGDS
        
        # Location
        "school.city",
        "school.state",
        "school.zip",
        "location.lat",
        "location.lon",
        "school.region_id",
        
        # Cost - Tuition
        "latest.cost.tuition.in_state",
        "latest.cost.tuition.out_of_state",
        
        # Cost - Housing
        "latest.cost.roomboard.oncampus",
        "latest.cost.roomboard.offcampus",
        
        # Cost - Attendance (COA)
        "latest.cost.attendance.academic_year",
        "school.academic_year_type",
        "latest.cost.attendance.program_year",
        
        # Aid
        "latest.aid.pell_grant_rate",
        "latest.aid.federal_loan_rate",
        "latest.cost.avg_net_price.public",
        "latest.cost.avg_net_price.private",
        "latest.aid.median_debt_completion_suppressed",
        
        # Admissions / Outcomes
        "latest.admissions.admission_rate.overall",
        "latest.admissions.sat_scores.average.overall",
        "latest.admissions.act_scores.midpoint.cumulative",
        "latest.earnings.10_yrs_after_entry.median",
        
        # Programs (Nested)
        "latest.programs.cip_4_digit"
    ]

def fetch_all_data():
    """
    Handles pagination and rate limiting to fetch all school records.
    """
    fields = get_field_mapping()
    params = {
        "api_key": API_KEY,
        "fields": ",".join(fields),
        "per_page": BATCH_SIZE,
        "page": 0
    }
    
    all_records = []
    page = 0
    total_pages = 1 # Initial assumption
    
    logger.info("Starting API ingestion...")
    
    while page < total_pages:
        params["page"] = page
        try:
            response = requests.get(BASE_URL, params=params)
            
            if response.status_code == 429:
                logger.warning("Rate limit hit. Backing off...")
                time.sleep(5)
                continue
                
            response.raise_for_status()
            data = response.json()
            
            # Update metadata on first fetch
            if page == 0:
                total_records = data['metadata']['total']
                total_pages = (total_records // BATCH_SIZE) + 1
                logger.info(f"Total records to fetch: {total_records} ({total_pages} pages)")
            
            results = data.get('results', [])
            if not results:
                break
                
            all_records.extend(results)
            
            if page % 10 == 0:
                logger.info(f"Processed page {page}/{total_pages}")
            
            page += 1
            time.sleep(0.1) # Polite delay
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Request failed on page {page}: {e}")
            time.sleep(2)
            # Simple retry logic could go here, but for now we log and continue/break
            # In production, might want robust retries.
            if page < total_pages:
                continue
            else:
                break

    logger.info(f"Ingestion complete. Retrieved {len(all_records)} records.")
    return all_records

def calculate_derived_metrics(df):
    """
    Applies the calculated metrics defined in the spec.
    """
    # 1. Region Name
    df['region_name'] = df['school.region_id'].map(REGION_MAP)
    
    # 2. Net Price (Combine Public and Private)
    df['avg_net_price'] = df['latest.cost.avg_net_price.public'].fillna(
        df['latest.cost.avg_net_price.private']
    )
    
    # 3. Scholarship Volatility Index
    # Formula: (Tuition_In_State - Avg_Net_Price) / Tuition_In_State
    # Handle division by zero
    df['scholarship_volatility'] = (
        (df['latest.cost.tuition.in_state'] - df['avg_net_price']) / 
        df['latest.cost.tuition.in_state']
    )
    # Clean up inf/nan from division by zero or missing data
    df['scholarship_volatility'] = df['scholarship_volatility'].replace([float('inf'), -float('inf')], 0).fillna(0)

    # 4. Housing Reality Flag
    # If off-campus is significantly cheaper than on-campus (e.g., > 20% cheaper), flag it
    # This is a heuristic interpretation of the spec's "Reality Check"
    df['housing_discrepancy_flag'] = (
        (df['latest.cost.roomboard.oncampus'] - df['latest.cost.roomboard.offcampus']) > 
        (0.2 * df['latest.cost.roomboard.oncampus'])
    )
    
    return df

def transpose_data(raw_data):
    """
    Explodes the school-centric data into program-centric data.
    """
    logger.info("Transposing data to Program-Centric view...")
    
    # Convert to DataFrame
    df_schools = pd.DataFrame(raw_data)
    
    # We need to preserve all columns EXCEPT the one we are exploding for the merge,
    # but meta parameters in json_normalize/explode can be tricky with nested lists of dicts.
    
    # Strategy: Use explode on the program column
    # First, ensure the program column lists are actual lists (handle NaNs)
    df_schools['latest.programs.cip_4_digit'] = df_schools['latest.programs.cip_4_digit'].apply(
        lambda x: x if isinstance(x, list) else []
    )
    
    # Explode
    df_exploded = df_schools.explode('latest.programs.cip_4_digit')
    
    # Now normalize the dictionary in the exploded column
    # The exploded column contains dicts like {'code': '...', 'title': '...', ...}
    # We will extract these into new columns
    
    # Filter out rows where there is no program data (NaN after explode)
    df_exploded = df_exploded.dropna(subset=['latest.programs.cip_4_digit'])
    
    # Extract keys from the program dicts
    program_df = pd.json_normalize(df_exploded['latest.programs.cip_4_digit'])
    
    # Reset index of exploded df to align with program_df
    df_exploded = df_exploded.reset_index(drop=True)
    program_df = program_df.reset_index(drop=True)
    
    # Concatenate
    # Note: program_df columns will be like 'code', 'title', 'credential.level', etc.
    # We rename them to be clear
    program_df.columns = [f"program_{col}" for col in program_df.columns]
    
    final_df = pd.concat([df_exploded.drop('latest.programs.cip_4_digit', axis=1), program_df], axis=1)
    
    logger.info(f"Transposition complete. {len(df_schools)} schools -> {len(final_df)} program records.")
    
    return final_df

def save_to_db(df):
    """
    Saves the transposed dataframe to SQLite.
    """
    logger.info(f"Saving to {DB_PATH}...")
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    
    # Write to SQL
    # 'programs' table
    df.to_sql('programs', conn, if_exists='replace', index=False)
    
    # Create indices for performance
    cursor = conn.cursor()
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_school_name ON programs (`school.name`)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_program_code ON programs (program_code)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_region ON programs (`school.region_id`)")
    
    conn.close()
    logger.info("Database successfully updated.")

def main():
    # 1. Fetch
    raw_data = fetch_all_data()
    
    if not raw_data:
        logger.error("No data retrieved.")
        return

    # 2. Transpose
    df_transposed = transpose_data(raw_data)
    
    # 3. Calculate Metrics
    df_enriched = calculate_derived_metrics(df_transposed)
    
    # 4. Save
    save_to_db(df_enriched)

if __name__ == "__main__":
    main()

