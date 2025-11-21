import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import api, { preferencesAPI } from '../lib/api';
import { applyPreferences } from '../lib/theme';
import { preferenceUpdateSchema, profileUpdateSchema } from '../validation/settingsSchemas';

// ----------------------------------------------------------------------------
// Interfaces & Types
// ----------------------------------------------------------------------------

interface SettingItem {
  id: string;              // e.g., 'user.firstName'
  category: string;        // e.g., 'User', 'Security'
  label: string;           // Display name
  description: string;     // Help text
  type: 'boolean' | 'select' | 'text' | 'number' | 'textarea' | 'tags';
  value: any;
  options?: { label: string; value: string }[];
}

type ValidationErrors = Record<string, string>;

// ----------------------------------------------------------------------------
// Helper Components
// ----------------------------------------------------------------------------

function TagsInput({
  setting,
  onChange,
  error,
  labelId: _labelId,
}: {
  setting: SettingItem;
  onChange: (id: string, value: any) => void;
  error?: string;
  labelId: string;
}) {
  const tags = Array.isArray(setting.value) ? setting.value : [];
  const [tagInput, setTagInput] = useState('');
  const inputErrorClasses = error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500';
  
  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange(setting.id, [...tags, trimmed]);
    }
    setTagInput('');
  };
  
  const removeTag = (tagToRemove: string) => {
    onChange(setting.id, tags.filter(t => t !== tagToRemove));
  };
  
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag: string) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-800"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-1 text-indigo-600 hover:text-indigo-800"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addTag(tagInput);
          }
        }}
        onBlur={() => {
          if (tagInput.trim()) {
            addTag(tagInput);
          }
        }}
        placeholder="Add a school and press Enter"
        className={`block w-full rounded-md py-2 px-3 text-base focus:outline-none sm:text-sm ${inputErrorClasses}`}
      />
    </div>
  );
}

function SettingInput({
  setting,
  onChange,
  error,
  labelId,
}: {
  setting: SettingItem;
  onChange: (id: string, value: any) => void;
  error?: string;
  labelId: string;
}) {
  const inputErrorClasses = error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500';

  switch (setting.type) {
    case 'boolean':
      return (
        <button
          type="button"
          onClick={() => onChange(setting.id, !setting.value)}
          aria-pressed={setting.value}
          aria-labelledby={labelId}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            setting.value ? 'bg-indigo-600 focus:ring-indigo-500' : 'bg-gray-200 focus:ring-gray-300'
          } ${error ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              setting.value ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      );
      
    case 'select':
      return (
        <select
          value={setting.value}
          onChange={(e) => onChange(setting.id, e.target.value)}
          id={setting.id}
          aria-labelledby={labelId}
          aria-invalid={Boolean(error)}
          className={`block w-full rounded-md py-2 pl-3 pr-10 text-base focus:outline-none sm:text-sm ${inputErrorClasses}`}
        >
          {setting.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
      
    case 'text':
      return (
        <input
          type="text"
          value={setting.value}
          onChange={(e) => onChange(setting.id, e.target.value)}
          id={setting.id}
          aria-labelledby={labelId}
          aria-invalid={Boolean(error)}
          className={`block w-full rounded-md py-2 px-3 text-base focus:outline-none sm:text-sm ${inputErrorClasses}`}
        />
      );
      
    case 'number':
      return (
        <input
          type="number"
          value={setting.value || ''}
          onChange={(e) => onChange(setting.id, e.target.value ? parseInt(e.target.value) : null)}
          id={setting.id}
          aria-labelledby={labelId}
          aria-invalid={Boolean(error)}
          className={`block w-24 rounded-md py-2 px-3 text-base focus:outline-none sm:text-sm ${inputErrorClasses}`}
        />
      );
    
    case 'textarea':
      return (
        <textarea
          value={setting.value || ''}
          onChange={(e) => onChange(setting.id, e.target.value)}
          id={setting.id}
          aria-labelledby={labelId}
          aria-invalid={Boolean(error)}
          rows={4}
          className={`block w-full rounded-md py-2 px-3 text-base focus:outline-none sm:text-sm ${inputErrorClasses}`}
        />
      );
    
    case 'tags':
      return <TagsInput setting={setting} onChange={onChange} error={error} labelId={labelId} />;
    
    default:
        return null;
  }
}

// ----------------------------------------------------------------------------
// Config / Definitions
// ----------------------------------------------------------------------------

const getDefaultSettings = (user: any, preferences: any): SettingItem[] => [
  // User Category
  {
    id: 'user.firstName',
    category: 'User',
    label: 'First Name',
    description: 'Your first name',
    type: 'text',
    value: user?.profile?.firstName || '',
  },
  {
    id: 'user.lastName',
    category: 'User',
    label: 'Last Name',
    description: 'Your last name',
    type: 'text',
    value: user?.profile?.lastName || '',
  },
  {
    id: 'user.city',
    category: 'User',
    label: 'City',
    description: 'Your city',
    type: 'text',
    value: user?.profile?.city || '',
  },
  {
    id: 'user.state',
    category: 'User',
    label: 'State',
    description: 'Your state or province',
    type: 'text',
    value: user?.profile?.state || '',
  },
  {
    id: 'user.graduationYear',
    category: 'User',
    label: 'Graduation Year',
    description: 'Your expected graduation year',
    type: 'number',
    value: user?.profile?.graduationYear || null,
  },
  
  // Academic Goals Category
  {
    id: 'user.intendedMajor',
    category: 'Academic Goals',
    label: 'Intended Major',
    description: 'Your intended field of study',
    type: 'text',
    value: user?.profile?.intendedMajor || '',
  },
  {
    id: 'user.careerGoals',
    category: 'Academic Goals',
    label: 'Career Goals',
    description: 'Describe your career aspirations',
    type: 'textarea',
    value: user?.profile?.careerGoals || '',
  },
  {
    id: 'user.preferredSchoolType',
    category: 'Academic Goals',
    label: 'Preferred School Type',
    description: 'Type of institution you prefer',
    type: 'select',
    value: user?.profile?.preferredSchoolType || '',
    options: [
      { label: 'Not specified', value: '' },
      { label: 'Public University', value: 'public-university' },
      { label: 'Private University', value: 'private-university' },
      { label: 'Liberal Arts College', value: 'liberal-arts' },
      { label: 'Community College', value: 'community-college' },
      { label: 'Technical Institute', value: 'technical' },
    ],
  },
  {
    id: 'user.preferredSchoolSize',
    category: 'Academic Goals',
    label: 'Preferred School Size',
    description: 'Size of student body you prefer',
    type: 'select',
    value: user?.profile?.preferredSchoolSize || '',
    options: [
      { label: 'Not specified', value: '' },
      { label: 'Small (< 5,000)', value: 'small' },
      { label: 'Medium (5,000 - 15,000)', value: 'medium' },
      { label: 'Large (15,000 - 30,000)', value: 'large' },
      { label: 'Very Large (> 30,000)', value: 'very-large' },
    ],
  },
  {
    id: 'user.preferredLocation',
    category: 'Academic Goals',
    label: 'Preferred Location',
    description: 'Geographic preference for schools',
    type: 'text',
    value: user?.profile?.preferredLocation || '',
  },
  {
    id: 'user.dreamSchools',
    category: 'Academic Goals',
    label: 'Dream Schools',
    description: 'Schools you are most interested in',
    type: 'tags',
    value: user?.profile?.dreamSchools || [],
  },
  
  // User Settings Category
  {
    id: 'preferences.timezone',
    category: 'User Settings',
    label: 'Timezone',
    description: 'Your timezone',
    type: 'select',
    value: preferences?.timezone || 'Pacific (UTC-8)',
    options: [
      { label: 'Pacific (UTC-8)', value: 'Pacific (UTC-8)' },
      { label: 'Mountain (UTC-7)', value: 'Mountain (UTC-7)' },
      { label: 'Central (UTC-6)', value: 'Central (UTC-6)' },
      { label: 'Eastern (UTC-5)', value: 'Eastern (UTC-5)' },
    ],
  },
  {
    id: 'preferences.pronouns',
    category: 'User Settings',
    label: 'Pronouns',
    description: 'Your preferred pronouns',
    type: 'select',
    value: preferences?.pronouns || 'He / Him',
    options: [
      { label: 'He / Him', value: 'He / Him' },
      { label: 'She / Her', value: 'She / Her' },
      { label: 'They / Them', value: 'They / Them' },
      { label: 'Prefer not to say', value: 'Prefer not to say' },
    ],
  },
  
  // Security Category
  {
    id: 'preferences.loginAlerts',
    category: 'Security',
    label: 'Login Alerts',
    description: 'Get notified when someone logs into your account',
    type: 'boolean',
    value: preferences?.loginAlerts ?? true,
  },
  {
    id: 'preferences.sessionTimeout',
    category: 'Security',
    label: 'Session Timeout (minutes)',
    description: 'Automatically log out after inactivity',
    type: 'number',
    value: preferences?.sessionTimeout || 60,
  },
  
  // Appearance Category
  {
    id: 'appearance.theme',
    category: 'Appearance',
    label: 'Theme',
    description: 'Choose your color theme',
    type: 'select',
    value: preferences?.theme || 'auto',
    options: [
      { label: 'Auto (System)', value: 'auto' },
      { label: 'Light', value: 'light' },
      { label: 'Dark', value: 'dark' },
    ],
  },
  {
    id: 'appearance.compactMode',
    category: 'Appearance',
    label: 'Compact Mode',
    description: 'Reduce whitespace',
    type: 'boolean',
    value: preferences?.compactMode ?? false,
  },
  {
    id: 'preferences.defaultView',
    category: 'Appearance',
    label: 'Default View',
    description: 'Default page to show on login',
    type: 'select',
    value: preferences?.defaultView || 'dashboard',
    options: [
      { label: 'Dashboard', value: 'dashboard' },
      { label: 'Settings', value: 'settings' },
    ],
  },
  
  // Notifications Category
  {
    id: 'notifications.reminders',
    category: 'Notifications',
    label: 'Reminders',
    description: 'Application deadlines and updates',
    type: 'boolean',
    value: preferences?.reminders ?? true,
  },
  {
    id: 'notifications.productUpdates',
    category: 'Notifications',
    label: 'Product Updates',
    description: 'News about new features',
    type: 'boolean',
    value: preferences?.productUpdates ?? true,
  },
  {
    id: 'preferences.digestEmail',
    category: 'Notifications',
    label: 'Digest Email',
    description: 'Receive weekly summary emails',
    type: 'boolean',
    value: preferences?.digestEmail ?? true,
  },
  {
    id: 'preferences.notificationSound',
    category: 'Notifications',
    label: 'Notification Sound',
    description: 'Play sound for notifications',
    type: 'boolean',
    value: preferences?.notificationSound ?? false,
  },
  
  // Editor Category
  {
    id: 'preferences.autoSave',
    category: 'Editor',
    label: 'Auto Save',
    description: 'Automatically save your work',
    type: 'boolean',
    value: preferences?.autoSave ?? true,
  },
  {
    id: 'preferences.spellCheck',
    category: 'Editor',
    label: 'Spell Check',
    description: 'Enable spell checking',
    type: 'boolean',
    value: preferences?.spellCheck ?? true,
  },
  {
    id: 'preferences.wordCount',
    category: 'Editor',
    label: 'Word Count',
    description: 'Show word count while typing',
    type: 'boolean',
    value: preferences?.wordCount ?? true,
  },
  
  // Privacy Category
  {
    id: 'privacy.profileVisibility',
    category: 'Privacy',
    label: 'Profile Visibility',
    description: 'Who can see your profile',
    type: 'select',
    value: preferences?.profileVisibility || 'colleges',
    options: [
      { label: 'Everyone', value: 'public' },
      { label: 'Colleges Only', value: 'colleges' },
      { label: 'Only Me', value: 'private' },
    ],
  },
  {
    id: 'preferences.activityTracking',
    category: 'Privacy',
    label: 'Activity Tracking',
    description: 'Allow tracking of your activity',
    type: 'boolean',
    value: preferences?.activityTracking ?? true,
  },
  {
    id: 'preferences.dataSharing',
    category: 'Privacy',
    label: 'Data Sharing',
    description: 'Share anonymized data for research',
    type: 'boolean',
    value: preferences?.dataSharing ?? false,
  },
];

// ----------------------------------------------------------------------------
// SettingsPage Component
// ----------------------------------------------------------------------------

export default function SettingsPage() {
  const { session } = useAuth();
  const user = useMemo(() => {
    if (!session) return null;
    const metadata = session.user.user_metadata || {};
    return {
      email: session.user.email ?? '',
      profile: {
        firstName: metadata.firstName || '',
        lastName: metadata.lastName || '',
        city: metadata.city || '',
        state: metadata.state || '',
        graduationYear: metadata.graduationYear || new Date().getFullYear() + 1,
        intendedMajor: metadata.intendedMajor || '',
        dreamSchools: metadata.dreamSchools || [],
      },
    };
  }, [session]);
  const queryClient = useQueryClient();
  
  // Local UI State
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [modifiedSettings, setModifiedSettings] = useState<Set<string>>(new Set());
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const isInitializedRef = useRef(false);

  // Fetch Preferences (once)
  const { data: preferences } = useQuery({
    queryKey: ['user-preferences'],
    queryFn: async () => {
      const { data } = await preferencesAPI.get();
      return data;
    },
    enabled: Boolean(user),
    // Long stale time to avoid background refetches overwriting form state
    staleTime: Infinity, 
  });

  // Initialize State ONCE when user/prefs are loaded
  useEffect(() => {
    if (!user || isInitializedRef.current) return;
    
    // If we have preferences (or it's a new user without them), init the form
    // We wait for preferences to be defined (or at least tried to fetch)
    if (user && preferences !== undefined) {
      const baseSettings = getDefaultSettings(user, preferences);
      setSettings(baseSettings);
      isInitializedRef.current = true;
    }
  }, [user, preferences]);

  // ----------------------------------------------------------------------------
  // Handlers
  // ----------------------------------------------------------------------------

  const updateSetting = (id: string, value: any) => {
    setSettings((prev) =>
      prev.map((s) => (s.id === id ? { ...s, value } : s))
    );
    setModifiedSettings((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // Clear validation error for this field
    if (validationErrors[id]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const validateUpdates = (
    profilePayload: Record<string, any>,
    preferencePayload: Record<string, any>
  ) => {
    const errors: ValidationErrors = {};
    const normalizedProfile: Record<string, any> = {};
    const normalizedPreferences: Record<string, any> = {};
    
    // Helper to normalize values (trim strings, nullify NaNs)
    const normalize = (payload: Record<string, any>, target: Record<string, any>) => {
      Object.entries(payload).forEach(([key, value]) => {
        if (typeof value === 'string') {
          const trimmed = value.trim();
          target[key] = trimmed.length ? trimmed : null;
        } else if (typeof value === 'number' && Number.isNaN(value)) {
          target[key] = null;
        } else {
          target[key] = value;
        }
      });
    };

    normalize(profilePayload, normalizedProfile);
    normalize(preferencePayload, normalizedPreferences);

    if (Object.keys(normalizedProfile).length) {
      const parsed = profileUpdateSchema.safeParse(normalizedProfile);
      if (!parsed.success) {
        parsed.error.issues.forEach((issue) => {
          const key = issue.path[0] as string;
          // Map back to settings ID if possible, or generic
          const setting = settings.find(s => s.id === `user.${key}`);
          const targetId = setting ? setting.id : `user.${key}`;
          errors[targetId] = issue.message;
        });
      } else {
        Object.assign(normalizedProfile, parsed.data);
      }
    }

    if (Object.keys(normalizedPreferences).length) {
      const parsed = preferenceUpdateSchema.safeParse(normalizedPreferences);
      if (!parsed.success) {
        parsed.error.issues.forEach((issue) => {
          const key = issue.path[0] as string;
          const setting = settings.find(s => s.id.endsWith(`.${key}`));
          const targetId = setting ? setting.id : `preferences.${key}`;
          errors[targetId] = issue.message;
        });
      } else {
        Object.assign(normalizedPreferences, parsed.data);
      }
    }

    return { errors, normalizedProfile, normalizedPreferences };
  };

  const saveSettings = useCallback(async ({ autoSave = false }: { autoSave?: boolean } = {}) => {
    if (modifiedSettings.size === 0) return;

    autoSave ? setIsAutoSaving(true) : setIsSaving(true);

    try {
      // 1. Prepare payloads from MODIFIED settings only
      const profileUpdates: Record<string, any> = {};
      const preferenceUpdates: Record<string, any> = {};

      settings.forEach((s) => {
        if (modifiedSettings.has(s.id)) {
          const [category, key] = s.id.split('.');
          if (category === 'user') {
            profileUpdates[key] = s.value;
          } else {
            // All other categories map to preferences schema fields
            // Note: Some IDs are 'appearance.theme' -> key 'theme'
            // Some are 'preferences.timezone' -> key 'timezone'
            // In the schema, they are all flat properties of preferences
            const actualKey = s.id.split('.').pop() || key;
            preferenceUpdates[actualKey] = s.value;
          }
        }
      });

      // 2. Validate
      const { errors, normalizedProfile, normalizedPreferences } = validateUpdates(profileUpdates, preferenceUpdates);

      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        if (!autoSave) {
            setSaveMessage('❌ Please fix the highlighted fields');
            setTimeout(() => setSaveMessage(null), 4000);
        }
        return;
      }

      // 3. Send updates
      const hasProfileUpdates = Object.keys(normalizedProfile).length > 0;
      const hasPreferenceUpdates = Object.keys(normalizedPreferences).length > 0;

      if (hasProfileUpdates) {
        await api.put('/students/profile', normalizedProfile);
      }

      if (hasPreferenceUpdates) {
        const { data: updated } = await preferencesAPI.update(normalizedPreferences);
        const latestPrefs = updated.preferences || updated;
        applyPreferences(latestPrefs);
        localStorage.setItem('preferences', JSON.stringify(latestPrefs));
      }

      // 4. Success State
      // Important: We DO NOT re-fetch/re-initialize settings here. 
      // The local state is the source of truth. We just confirm it's saved.
      setModifiedSettings(new Set());
      setValidationErrors({});
      
      if (!autoSave) {
        setSaveMessage('✅ Edits have been saved');
        setTimeout(() => setSaveMessage(null), 4000);
      }

      // 5. Background Sync
      // We can invalidate queries so OTHER parts of the app (like Dashboard) update,
      // but we've set staleTime: Infinity for THIS component's query to prevent overwrite.
      await queryClient.invalidateQueries({ queryKey: ['student-profile'] });
      await queryClient.invalidateQueries({ queryKey: ['user-preferences'] });

    } catch (error: any) {
      console.error('Save failed:', error);
      if (!autoSave) {
          setSaveMessage(`❌ ${error.response?.data?.message || 'Failed to save'}`);
          setTimeout(() => setSaveMessage(null), 4000);
      }
    } finally {
      autoSave ? setIsAutoSaving(false) : setIsSaving(false);
    }
  }, [modifiedSettings, settings, queryClient]);

  // ----------------------------------------------------------------------------
  // Effects
  // ----------------------------------------------------------------------------

  // Auto-save Debounce
  const autoSaveEnabled = useMemo(() => {
    const s = settings.find(i => i.id === 'preferences.autoSave');
    return s ? Boolean(s.value) : true;
  }, [settings]);

  useEffect(() => {
    if (!autoSaveEnabled || modifiedSettings.size === 0 || isSaving || isAutoSaving || Object.keys(validationErrors).length > 0) {
      return;
    }

    const timer = setTimeout(() => {
      saveSettings({ autoSave: true });
    }, 1500); // 1.5s debounce

    return () => clearTimeout(timer);
  }, [modifiedSettings, autoSaveEnabled, isSaving, isAutoSaving, validationErrors, saveSettings]);

  // ----------------------------------------------------------------------------
  // Rendering
  // ----------------------------------------------------------------------------

  const categories = useMemo(() => 
    Array.from(new Set(settings.map(s => s.category))), 
  [settings]);

  const filteredSettings = useMemo(() => {
    let filtered = settings;
    if (selectedCategory) {
      filtered = filtered.filter(s => s.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(s => 
        s.label.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [settings, selectedCategory, searchQuery]);

  return (
    <div className="flex h-full min-h-0 bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 border-r bg-white flex flex-col h-full min-h-0">
        <div className="p-4 border-b">
          <input
            type="text"
            placeholder="Search settings"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value) setSelectedCategory(null);
            }}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <button 
            onClick={() => setSelectedCategory(null)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm ${!selectedCategory ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'}`}
          >
            All Settings
          </button>
          {categories.map((category) => (
            <button 
              key={category} 
              onClick={() => setSelectedCategory(category)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedCategory === category ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'}`}
            >
              {category}
            </button>
          ))}
        </div>
        
        <div className="p-3 border-t">
          {modifiedSettings.size > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <p>{modifiedSettings.size} setting{modifiedSettings.size > 1 ? 's' : ''} modified</p>
              </div>
              <button
                onClick={() => saveSettings({ autoSave: false })}
                disabled={isSaving}
                className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          ) : (
            <div className="space-y-1 text-center">
                 <p className="text-xs text-gray-500">No changes to save</p>
                 {autoSaveEnabled && (
                    <p className="text-[10px] text-gray-400">
                        {isAutoSaving ? 'Auto-saving...' : 'Auto-save is active'}
                    </p>
                 )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 min-h-0">
        {settings.length === 0 ? (
            <div className="max-w-3xl mx-auto text-center py-12">
                <p className="text-gray-500">Loading settings...</p>
            </div>
        ) : filteredSettings.length === 0 ? (
            <div className="max-w-3xl mx-auto text-center py-12">
                <p className="text-gray-500">No settings found matching your search.</p>
            </div>
        ) : (
            <div className="max-w-3xl mx-auto space-y-8">
                {filteredSettings.map((setting) => (
                    <div key={setting.id} className="flex items-center justify-between py-4 border-b last:border-0">
                        <div className="pr-8">
                            <label
                              id={`${setting.id}-label`}
                              className="block text-sm font-medium text-gray-900"
                            >
                                {setting.label}
                                {modifiedSettings.has(setting.id) && (
                                    <span className="ml-2 inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full" title="Modified" />
                                )}
                            </label>
                            <p className="mt-1 text-sm text-gray-500">{setting.description}</p>
                            {validationErrors[setting.id] && (
                              <p className="mt-2 text-sm text-red-600">{validationErrors[setting.id]}</p>
                            )}
                        </div>
                        <div className="flex-shrink-0">
                            <SettingInput
                              setting={setting}
                              onChange={updateSetting}
                              error={validationErrors[setting.id]}
                              labelId={`${setting.id}-label`}
                            />
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* Toast Notification */}
      {saveMessage && (
          <div className="fixed bottom-4 right-4 bg-white border border-gray-200 shadow-lg rounded-lg p-4 flex items-center animate-fade-in-up z-50">
              <p className="text-sm font-medium text-gray-900">{saveMessage}</p>
          </div>
      )}
    </div>
  );
}
