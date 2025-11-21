export function applyPreferences(preferences: any) {
  console.log('Applying preferences:', preferences);
  // In a real app, this would toggle dark mode class on document.body
  if (preferences?.theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else if (preferences?.theme === 'light') {
    document.documentElement.classList.remove('dark');
  }
}

