import json
import os
import time

import requests

from config import get_env_var

API_KEY = get_env_var("COLLEGE_SCORECARD_API_KEY", required=True)
BASE_URL = "https://api.data.gov/ed/collegescorecard/v1/schools"

def fetch_colleges():
    print("Fetching data from College Scorecard API...")
    
    # Fields to retrieve
    fields = [
        "id",
        "school.name",
        "school.city",
        "school.state",
        "school.zip",
        "school.school_url",
        "latest.student.size",
        "latest.admissions.admission_rate.overall",
        "latest.cost.tuition.in_state",
        "latest.cost.tuition.out_of_state",
        "school.ownership",
        "school.degrees_awarded.predominant"
    ]
    
    # Parameters for the API request
    params = {
        "api_key": API_KEY,
        "fields": ",".join(fields),
        "per_page": 100,
        "page": 0,
        "school.operating": 1, # Only currently operating schools
        "school.degrees_awarded.predominant__range": "2..3" # Predominantly associate's or bachelor's degrees
    }
    
    all_schools = []
    page = 0
    total_pages = 1 # Will be updated after first request
    
    # Directory for data
    output_dir = os.path.join(os.path.dirname(__file__), '../data')
    os.makedirs(output_dir, exist_ok=True)
    
    while page < total_pages:
        print(f"Fetching page {page + 1}...")
        params["page"] = page
        
        try:
            response = requests.get(BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()
            
            # Update metadata on first run
            if page == 0:
                total_results = data.get('metadata', {}).get('total', 0)
                per_page = data.get('metadata', {}).get('per_page', 100)
                total_pages = (total_results // per_page) + 1
                print(f"Found {total_results} schools. Fetching {total_pages} pages.")
            
            results = data.get('results', [])
            if not results:
                break
                
            # Transform data to a cleaner format
            for school in results:
                clean_school = {
                    "id": school.get("id"),
                    "name": school.get("school.name"),
                    "city": school.get("school.city"),
                    "state": school.get("school.state"),
                    "zip": school.get("school.zip"),
                    "url": school.get("school.school_url"),
                    "student_size": school.get("latest.student.size"),
                    "admission_rate": school.get("latest.admissions.admission_rate.overall"),
                    "in_state_tuition": school.get("latest.cost.tuition.in_state"),
                    "out_of_state_tuition": school.get("latest.cost.tuition.out_of_state"),
                    "ownership": school.get("school.ownership"), # 1=Public, 2=Private Nonprofit, 3=Private For-Profit
                    "predominant_degree": school.get("school.degrees_awarded.predominant")
                }
                all_schools.append(clean_school)
            
            page += 1
            # Respect rate limits (if any, though api.data.gov is generous)
            time.sleep(0.2)
            
            # For testing, limit to 5 pages (500 schools) to check format first
            # Remove this check to fetch all
            if page >= 5: 
                print("Stopping at 5 pages for initial test.")
                break
                
        except requests.RequestException as e:
            print(f"Error on page {page}: {e}")
            # Wait a bit and try again or skip?
            time.sleep(2)
            continue

    output_file = os.path.join(output_dir, 'colleges_api.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_schools, f, indent=2)
        
    print(f"Saved {len(all_schools)} schools to {output_file}")

if __name__ == "__main__":
    fetch_colleges()

