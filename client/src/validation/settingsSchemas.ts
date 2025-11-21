import { z } from 'zod';

export const profileUpdateSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  graduationYear: z.number().optional().nullable(),
  intendedMajor: z.string().optional(),
  careerGoals: z.string().optional(),
  preferredSchoolType: z.string().optional(),
  preferredSchoolSize: z.string().optional(),
  preferredLocation: z.string().optional(),
  dreamSchools: z.array(z.string()).optional(),
});

export const preferenceUpdateSchema = z.object({
  timezone: z.string().optional(),
  pronouns: z.string().optional(),
  loginAlerts: z.boolean().optional(),
  sessionTimeout: z.number().optional(),
  theme: z.enum(['auto', 'light', 'dark']).optional(),
  compactMode: z.boolean().optional(),
  defaultView: z.string().optional(),
  reminders: z.boolean().optional(),
  productUpdates: z.boolean().optional(),
  digestEmail: z.boolean().optional(),
  notificationSound: z.boolean().optional(),
  autoSave: z.boolean().optional(),
  spellCheck: z.boolean().optional(),
  wordCount: z.boolean().optional(),
  profileVisibility: z.string().optional(),
  activityTracking: z.boolean().optional(),
  dataSharing: z.boolean().optional(),
});

