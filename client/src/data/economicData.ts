export interface StateData {
  id: string;
  name: string;
  avgRent: number; // Monthly
  avgEntrySalary: number; // Annual
  costOfLivingIndex: number; // National avg = 100
  lifestyle: string[];
  topIndustries: string[];
  imageUrl: string;
}

export const stateData: Record<string, StateData> = {
  'CA': {
    id: 'CA',
    name: 'California',
    avgRent: 2950,
    avgEntrySalary: 68000,
    costOfLivingIndex: 142.2,
    lifestyle: ['Beaches', 'Tech Scene', 'Hiking', 'Foodie Culture'],
    topIndustries: ['Technology', 'Entertainment', 'Agriculture'],
    imageUrl: 'https://images.unsplash.com/photo-1449034446853-66c86144b0ad?auto=format&fit=crop&q=80',
  },
  'NY': {
    id: 'NY',
    name: 'New York',
    avgRent: 3400,
    avgEntrySalary: 70000,
    costOfLivingIndex: 139.1,
    lifestyle: ['Nightlife', 'Museums', 'Broadway', 'Public Transit'],
    topIndustries: ['Finance', 'Media', 'Fashion'],
    imageUrl: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&q=80',
  },
  'TX': {
    id: 'TX',
    name: 'Texas',
    avgRent: 1600,
    avgEntrySalary: 58000,
    costOfLivingIndex: 92.5,
    lifestyle: ['Live Music', 'BBQ', 'Sports', 'Low Taxes'],
    topIndustries: ['Energy', 'Technology', 'Aerospace'],
    imageUrl: 'https://images.unsplash.com/photo-1531218535973-29fa57474500?auto=format&fit=crop&q=80',
  },
  'FL': {
    id: 'FL',
    name: 'Florida',
    avgRent: 1800,
    avgEntrySalary: 52000,
    costOfLivingIndex: 100.3,
    lifestyle: ['Beaches', 'Theme Parks', 'Water Sports', 'Nightlife'],
    topIndustries: ['Tourism', 'Healthcare', 'Aerospace'],
    imageUrl: 'https://images.unsplash.com/photo-1535448033526-c0e85c9e6968?auto=format&fit=crop&q=80',
  },
  'MA': {
    id: 'MA',
    name: 'Massachusetts',
    avgRent: 2700,
    avgEntrySalary: 66000,
    costOfLivingIndex: 127.5,
    lifestyle: ['History', 'Academia', 'Seafood', 'Sports'],
    topIndustries: ['Biotech', 'Education', 'Finance'],
    imageUrl: 'https://images.unsplash.com/photo-1504198266287-1659872e6590?auto=format&fit=crop&q=80',
  },
  'WA': {
    id: 'WA',
    name: 'Washington',
    avgRent: 2200,
    avgEntrySalary: 65000,
    costOfLivingIndex: 115.1,
    lifestyle: ['Coffee Culture', 'Hiking', 'Music', 'Tech'],
    topIndustries: ['Technology', 'Aerospace', 'Retail'],
    imageUrl: 'https://images.unsplash.com/photo-1437846972679-9e6e537be46e?auto=format&fit=crop&q=80',
  },
  'IL': {
    id: 'IL',
    name: 'Illinois',
    avgRent: 1700,
    avgEntrySalary: 59000,
    costOfLivingIndex: 95.0,
    lifestyle: ['Architecture', 'Food', 'Lake Michigan', 'Arts'],
    topIndustries: ['Finance', 'Manufacturing', 'Technology'],
    imageUrl: 'https://images.unsplash.com/photo-1494522855154-9297ac14b55f?auto=format&fit=crop&q=80',
  },
  'CO': {
    id: 'CO',
    name: 'Colorado',
    avgRent: 1900,
    avgEntrySalary: 60000,
    costOfLivingIndex: 105.0,
    lifestyle: ['Skiing', 'Hiking', 'Craft Beer', 'Outdoors'],
    topIndustries: ['Aerospace', 'Technology', 'Tourism'],
    imageUrl: 'https://images.unsplash.com/photo-1546704346-6e7570f2d1e3?auto=format&fit=crop&q=80',
  },
  // Default for others
  'DEFAULT': {
    id: 'US',
    name: 'Average US State',
    avgRent: 1500,
    avgEntrySalary: 54000,
    costOfLivingIndex: 100.0,
    lifestyle: ['Community Events', 'Local Parks', 'Shopping'],
    topIndustries: ['Healthcare', 'Retail', 'Education'],
    imageUrl: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&q=80',
  },
};

export const getROI = (tuition: number, stateCode: string) => {
  const data = stateData[stateCode] || stateData['DEFAULT'];
  // Simple ROI: (Annual Salary - (Rent * 12)) / Tuition
  // This is a very rough "First Year Cashflow ROI"
  const annualRent = data.avgRent * 12;
  const discretionary = data.avgEntrySalary - annualRent;
  const roi = tuition > 0 ? (discretionary / tuition) * 100 : 0;
  return roi.toFixed(1);
};

