import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  StudentProfile,
  fetchProfilesDirectory,
  createStudentProfile,
  CreateProfilePayload,
  fetchMyProfile,
  updateStudentProfile,
  deleteStudentProfile,
  uploadProfileMedia,
} from '../lib/api';
import { useAuth } from '../hooks/useAuth';

type PortfolioDraft = {
  title: string;
  description: string;
  media_url: string;
  tags: string;
  uploading?: boolean;
  uploadError?: string | null;
};

const emptyPortfolioDraft: PortfolioDraft = {
  title: '',
  description: '',
  media_url: '',
  tags: '',
  uploading: false,
  uploadError: null,
};

const initialForm: CreateProfilePayload = {
  name: '',
  tagline: '',
  bio: '',
  home_city: '',
  home_state: '',
  program_focus: '',
  budget_focus: '',
  avatar_url: '',
  website_url: '',
  showcase_video_url: '',
  portfolio: [],
};

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<StudentProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formState, setFormState] = useState<CreateProfilePayload>(initialForm);
  const [portfolioDrafts, setPortfolioDrafts] = useState<PortfolioDraft[]>([{ ...emptyPortfolioDraft }]);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const { session, loading: authLoading, magicLinkSent, error: authError, signInWithEmail, signOut } = useAuth();
  const [ownedProfile, setOwnedProfile] = useState<StudentProfile | null>(null);
  const [ownedProfileLoading, setOwnedProfileLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchProfilesDirectory({ limit: 60 })
      .then((resp) => {
        if (cancelled) return;
        setProfiles(resp.results);
        if (resp.results.length) {
          setSelectedProfile(resp.results[0]);
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setOwnedProfile(null);
      if (!authLoading) {
        setAuthNotice(null);
        setFormState(initialForm);
        setPortfolioDrafts([{ ...emptyPortfolioDraft }]);
      }
      return;
    }
    let cancelled = false;
    setOwnedProfileLoading(true);
    fetchMyProfile()
      .then((profile) => {
        if (cancelled) return;
        setOwnedProfile(profile);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        if (err.message.toLowerCase().includes('not found')) {
          setOwnedProfile(null);
        } else {
          setAuthNotice(err.message);
        }
      })
      .finally(() => {
        if (cancelled) return;
        setOwnedProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, authLoading]);

  const handleFormChange = (field: keyof CreateProfilePayload, value: string) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  useEffect(() => {
    if (!ownedProfile) {
      return;
    }
    setFormState({
      name: ownedProfile.name ?? '',
      tagline: ownedProfile.tagline ?? '',
      bio: ownedProfile.bio ?? '',
      home_city: ownedProfile.home_city ?? '',
      home_state: ownedProfile.home_state ?? '',
      program_focus: ownedProfile.program_focus ?? '',
      budget_focus: ownedProfile.budget_focus ?? '',
      avatar_url: ownedProfile.avatar_url ?? '',
      website_url: ownedProfile.website_url ?? '',
      showcase_video_url: ownedProfile.showcase_video_url ?? '',
      portfolio: [],
    });
    setPortfolioDrafts(
      ownedProfile.portfolio.length
        ? ownedProfile.portfolio.map((item) => ({
            title: item.title,
            description: item.description ?? '',
            media_url: item.media_url ?? '',
            tags: item.tags.join(', '),
            uploading: false,
            uploadError: null,
          }))
        : [{ ...emptyPortfolioDraft }],
    );
  }, [ownedProfile]);

  const handlePortfolioChange = (index: number, field: keyof PortfolioDraft, value: string) => {
    setPortfolioDrafts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setAvatarUploadError(null);
    setAvatarUploading(true);
    try {
      const result = await uploadProfileMedia(file, 'avatar');
      setFormState((prev) => ({
        ...prev,
        avatar_url: result.public_url,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.';
      setAvatarUploadError(message);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handlePortfolioFileChange = async (index: number, file: File) => {
    setPortfolioDrafts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], uploading: true, uploadError: null };
      return next;
    });
    try {
      const result = await uploadProfileMedia(file, 'portfolio');
      handlePortfolioChange(index, 'media_url', result.public_url);
      setPortfolioDrafts((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], uploading: false, uploadError: null };
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.';
      setPortfolioDrafts((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], uploading: false, uploadError: message };
        return next;
      });
    }
  };

  const addPortfolioDraft = () => {
    setPortfolioDrafts((prev) => [...prev, { ...emptyPortfolioDraft }]);
  };

  const removePortfolioDraft = (index: number) => {
    setPortfolioDrafts((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setFormState(initialForm);
    setPortfolioDrafts([{ ...emptyPortfolioDraft }]);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.name.trim()) {
      setSubmitMessage('Name is required.');
      return;
    }
    if (!session) {
      setSubmitMessage('Please sign in to publish your profile.');
      return;
    }
    setSubmitting(true);
    setSubmitMessage(null);
    const payload: CreateProfilePayload = {
      ...formState,
      home_state: formState.home_state?.toUpperCase(),
      portfolio: portfolioDrafts
        .filter((draft) => draft.title.trim())
        .map((draft) => ({
          title: draft.title.trim(),
          description: draft.description || undefined,
          media_url: draft.media_url || undefined,
          tags: draft.tags
            ? draft.tags
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean)
            : [],
        })),
    };

    const request = ownedProfile ? updateStudentProfile(ownedProfile.id, payload) : createStudentProfile(payload);

    request
      .then((profile) => {
        setProfiles((prev) => {
          const existingIndex = prev.findIndex((p) => p.id === profile.id);
          if (existingIndex >= 0) {
            const clone = [...prev];
            clone[existingIndex] = profile;
            return clone;
          }
          return [profile, ...prev];
        });
        setSelectedProfile(profile);
        setOwnedProfile(profile);
        setSubmitMessage(ownedProfile ? 'Profile updated successfully.' : 'Profile submitted! It is now visible in the showcase.');
        if (!ownedProfile) {
          resetForm();
        }
      })
      .catch((err: Error) => {
        setSubmitMessage(err.message);
      })
      .finally(() => setSubmitting(false));
  };

  const handleDeleteProfile = () => {
    if (!ownedProfile || !session) {
      return;
    }
    const confirmed = window.confirm('Delete your showcase profile? This action cannot be undone.');
    if (!confirmed) return;
    setSubmitting(true);
    deleteStudentProfile(ownedProfile.id)
      .then(() => {
        setProfiles((prev) => prev.filter((profile) => profile.id !== ownedProfile.id));
        if (selectedProfile?.id === ownedProfile.id) {
          setSelectedProfile(null);
        }
        setOwnedProfile(null);
        resetForm();
        setSubmitMessage('Your profile has been deleted.');
      })
      .catch((err: Error) => setSubmitMessage(err.message))
      .finally(() => setSubmitting(false));
  };

  const profileList = useMemo(() => {
    if (!profiles.length) return [];
    return profiles;
  }, [profiles]);

  const requestMagicLink = async () => {
    if (!loginEmail.trim()) {
      setAuthNotice('Enter an email to receive a secure sign-in link.');
      return;
    }
    try {
      await signInWithEmail(loginEmail.trim());
      setAuthNotice('Check your inbox for a secure sign-in link.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send magic link.';
      setAuthNotice(message);
    }
  };

  return (
    <div className="flex h-full flex-col gap-8 overflow-y-auto bg-gray-50 p-6">
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-indigo-500">Student Showcase</p>
            <h1 className="text-2xl font-semibold text-gray-900">Profiles & Portfolios</h1>
            <p className="text-sm text-gray-500">
              Discover student ambassadors, budgets, and creative work across every region. Add your own profile to inspire
              the next cohort.
            </p>
          </div>
          <a
            href="#create-profile"
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Share your story
          </a>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Featured Students</h2>
            {loading && <span className="text-xs text-gray-400">Loading…</span>}
          </div>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <div className="mt-4 grid gap-3">
            {profileList.map((profile) => (
              <button
                key={profile.id}
                onClick={() => setSelectedProfile(profile)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                  selectedProfile?.id === profile.id ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100 bg-white hover:border-indigo-100'
                }`}
              >
                <p className="text-sm font-semibold text-gray-900">{profile.name}</p>
                <p className="text-xs text-gray-500">
                  {[profile.program_focus, profile.home_state].filter(Boolean).join(' · ') || 'Open focus'}
                </p>
                {profile.status && (
                  <span
                    className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      profile.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-700'
                        : profile.status === 'rejected'
                          ? 'bg-red-50 text-red-600'
                          : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {profile.status === 'approved'
                      ? 'Approved'
                      : profile.status === 'rejected'
                        ? 'Needs edits'
                        : 'Pending review'}
                  </span>
                )}
                {profile.tagline && <p className="mt-1 text-sm text-gray-600">{profile.tagline}</p>}
              </button>
            ))}
            {!loading && !profileList.length && (
              <p className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500">
                No profiles yet. Be the first to share your story!
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          {selectedProfile ? (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                {selectedProfile.avatar_url ? (
                  <img
                    src={selectedProfile.avatar_url}
                    alt={selectedProfile.name}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-lg font-semibold text-indigo-600">
                    {selectedProfile.name
                      .split(' ')
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                )}
                <div>
                  <p className="text-xl font-semibold text-gray-900">{selectedProfile.name}</p>
                  {selectedProfile.status && (
                    <span
                      className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        selectedProfile.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-700'
                          : selectedProfile.status === 'rejected'
                            ? 'bg-red-50 text-red-600'
                            : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {selectedProfile.status === 'approved'
                        ? 'Approved'
                        : selectedProfile.status === 'rejected'
                          ? 'Needs edits'
                          : 'Pending review'}
                    </span>
                  )}
                  {selectedProfile.tagline && <p className="text-sm text-gray-500">{selectedProfile.tagline}</p>}
                  <p className="text-xs text-gray-500">
                    {[selectedProfile.home_city, selectedProfile.home_state].filter(Boolean).join(', ') || 'Remote'}
                  </p>
                </div>
              </div>
              {selectedProfile.bio && <p className="text-sm leading-relaxed text-gray-700">{selectedProfile.bio}</p>}
              {selectedProfile.review_notes && (
                <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700">
                  <p className="font-semibold">Moderator notes</p>
                  <p>{selectedProfile.review_notes}</p>
                </div>
              )}
              <div className="grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                <FieldStat label="Program Focus" value={selectedProfile.program_focus || '—'} />
                <FieldStat label="Budget Focus" value={selectedProfile.budget_focus || '—'} />
                <FieldStat label="Website" value={selectedProfile.website_url ? selectedProfile.website_url : '—'} />
                <FieldStat label="Showcase Video" value={selectedProfile.showcase_video_url ? selectedProfile.showcase_video_url : '—'} />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Portfolio</p>
                {selectedProfile.portfolio.length ? (
                  <ul className="mt-2 space-y-2">
                    {selectedProfile.portfolio.map((item) => (
                      <li key={item.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm text-gray-700">
                        <p className="font-semibold text-gray-900">{item.title}</p>
                        {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                              {tag}
                            </span>
                          ))}
                        </div>
                        {item.media_url && (
                          <a
                            href={item.media_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center text-xs font-medium text-indigo-600 hover:text-indigo-500"
                          >
                            View project →
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">No portfolio entries yet.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Select a student to view their profile.</p>
          )}
        </div>
      </section>

      <section id="create-profile" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Add Your Profile</h2>
          <p className="text-sm text-gray-500">
            Share your background, budget insights, and projects. Your profile helps future students understand life at
            your school.
          </p>
          {submitMessage && <p className="text-sm text-indigo-600">{submitMessage}</p>}
        </div>

        {!session ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4">
            <p className="text-sm font-medium text-indigo-900">
              Sign in with your email to create or edit your student showcase profile.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="you@email.com"
                className="flex-1 rounded-lg border border-white/80 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={requestMagicLink}
                disabled={authLoading}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
              >
                {authLoading ? 'Sending…' : 'Email me a magic link'}
              </button>
            </div>
            {magicLinkSent && (
              <p className="text-xs font-semibold text-indigo-700">
                Magic link sent! Check your inbox (and spam) to complete sign-in.
              </p>
            )}
            {authNotice && <p className="text-xs text-indigo-900">{authNotice}</p>}
            {authError && <p className="text-xs text-red-600">{authError}</p>}
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
              <div>
                Signed in as <span className="font-semibold text-gray-900">{session.user.email}</span>.{' '}
                {ownedProfile
                  ? 'You can update or delete your existing profile below.'
                  : 'Create your first showcase profile below.'}
                {ownedProfile?.status && (
                  <span className="ml-1 text-xs text-gray-500">
                    Status: {ownedProfile.status === 'approved' ? 'Approved' : ownedProfile.status === 'rejected' ? 'Needs edits' : 'Pending review'}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={signOut}
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-500"
              >
                Sign out
              </button>
            </div>
            {ownedProfileLoading ? (
              <p className="mt-4 text-sm text-gray-500">Loading your profile…</p>
            ) : (
              <form className="mt-4 grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Full Name" value={formState.name ?? ''} onChange={(value) => handleFormChange('name', value)} required />
            <FormField
              label="Tagline"
              value={formState.tagline ?? ''}
              onChange={(value) => handleFormChange('tagline', value)}
              placeholder="e.g., First-gen biotech major"
            />
            <FormField
              label="Home City"
              value={formState.home_city ?? ''}
              onChange={(value) => handleFormChange('home_city', value)}
            />
            <FormField
              label="Home State"
              value={formState.home_state ?? ''}
              onChange={(value) => handleFormChange('home_state', value)}
              placeholder="CA"
              maxLength={2}
            />
            <FormField
              label="Program Focus"
              value={formState.program_focus ?? ''}
              onChange={(value) => handleFormChange('program_focus', value)}
              placeholder="e.g., 11.0701 Computer Science"
            />
            <FormField
              label="Budget Focus"
              value={formState.budget_focus ?? ''}
              onChange={(value) => handleFormChange('budget_focus', value)}
              placeholder="e.g., <$25k after aid"
            />
          </div>
          <FormTextArea
            label="Your Story"
            value={formState.bio ?? ''}
            onChange={(value) => handleFormChange('bio', value)}
            placeholder="Describe your journey, challenges, and wins."
          />
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              label="Avatar URL"
              value={formState.avatar_url ?? ''}
              onChange={(value) => handleFormChange('avatar_url', value)}
            />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Avatar Upload</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading || !session}
                  className="rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {avatarUploading ? 'Uploading…' : 'Upload Image'}
                </button>
                {formState.avatar_url && (
                  <span className="text-xs text-gray-500 truncate max-w-[160px]">{formState.avatar_url}</span>
                )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
              {avatarUploadError && <p className="text-xs text-red-600">{avatarUploadError}</p>}
            </div>
            <FormField
              label="Website / Linktree"
              value={formState.website_url ?? ''}
              onChange={(value) => handleFormChange('website_url', value)}
            />
            <FormField
              label="Showcase Video URL"
              value={formState.showcase_video_url ?? ''}
              onChange={(value) => handleFormChange('showcase_video_url', value)}
            />
          </div>

          <div className="rounded-xl border border-dashed border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Portfolio Highlights</p>
              <button
                type="button"
                onClick={addPortfolioDraft}
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-500"
              >
                Add project
              </button>
            </div>
            <p className="text-xs text-gray-500">Add up to three projects that represent your work or campus life.</p>
            <div className="mt-4 space-y-4">
              {portfolioDrafts.map((draft, index) => (
                <div key={index} className="rounded-lg border border-gray-100 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">Project {index + 1}</p>
                    {portfolioDrafts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePortfolioDraft(index)}
                        className="text-xs font-semibold text-red-500 hover:text-red-400"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <FormField
                    label="Title"
                    value={draft.title}
                    onChange={(value) => handlePortfolioChange(index, 'title', value)}
                    required={index === 0}
                  />
                  <FormTextArea
                    label="Description"
                    value={draft.description}
                    onChange={(value) => handlePortfolioChange(index, 'description', value)}
                  />
                  <FormField
                    label="Media URL"
                    value={draft.media_url}
                    onChange={(value) => handlePortfolioChange(index, 'media_url', value)}
                  />
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Upload File (optional)
                    </label>
                    <div className="flex items-center gap-3">
                      <label
                        htmlFor={`portfolio-upload-${index}`}
                        className={`cursor-pointer rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold ${
                          draft.uploading ? 'text-gray-400' : 'text-indigo-600 hover:bg-indigo-50'
                        }`}
                      >
                        {draft.uploading ? 'Uploading…' : 'Upload Media'}
                      </label>
                      <input
                        id={`portfolio-upload-${index}`}
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (file) handlePortfolioFileChange(index, file);
                        }}
                      />
                      {draft.media_url && (
                        <span className="text-xs text-gray-500 truncate max-w-[180px]">{draft.media_url}</span>
                      )}
                    </div>
                    {draft.uploadError && <p className="text-xs text-red-600">{draft.uploadError}</p>}
                  </div>
                  <FormField
                    label="Tags (comma separated)"
                    value={draft.tags}
                    onChange={(value) => handlePortfolioChange(index, 'tags', value)}
                    placeholder="financial aid, research, design"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
                {ownedProfile && (
                  <button
                    type="button"
                    onClick={handleDeleteProfile}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                    disabled={submitting}
                  >
                    Delete Profile
                  </button>
                )}
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              disabled={submitting}
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Publish Profile'}
            </button>
          </div>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  required,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </div>
  );
}

function FormTextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </div>
  );
}

function FieldStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value || '—'}</p>
    </div>
  );
}

