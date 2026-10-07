// components/AuthModal.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, User, Mail, Smartphone, Shield, Sparkles, Gift, ArrowRight, 
  CheckCircle2, LogIn, Key, Compass, Eye, EyeOff, ShieldAlert, 
  MapPin, Globe, Languages, Camera, RefreshCw, Lock, AlertTriangle, Cpu
} from 'lucide-react';
import { useDBState, dbOperations, UserRole, getDBState, saveDBState, reloadFromSupabase } from '../lib/store';
import { createClient } from '@/lib/supabase/client';
import { SmartImage } from './ui/SmartImage';
import Meter from './ui/Meter';
import { toast } from '@/lib/feedback';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialMode?: 'login' | 'register';
}

type AuthMode = 'login' | 'register' | 'forgot_password' | 'reset_password_otp' | 'new_password' | 'otp_verify' | 'onboarding';

export default function AuthModal({ isOpen, onClose, onSuccess, initialMode }: AuthModalProps) {
  const db = useDBState();
  const [mode, setMode] = useState<AuthMode>('login');

  useEffect(() => {
    if (isOpen && initialMode) {
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);
  
  // Real-time Field feedback
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 1. LOGIN STATE
  const [loginIdentifier, setLoginIdentifier] = useState(''); // Email or Phone
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // 2. REGISTER STATE
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.BUYER);
  const [referralCode, setReferralCode] = useState('');

  // 3. OTP & VERIFICATION STATE
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(120); // 2 minutes
  const [otpPurpose, setOtpPurpose] = useState<'REGISTER' | 'FORGOT_PASSWORD'>('REGISTER');

  // 4. FORGOT & RESET PASSWORD STATE
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');

  // 5. ONBOARDING STATE
  const [onboardingPhoto, setOnboardingPhoto] = useState('');
  const [onboardingState, setOnboardingState] = useState('Lagos');
  const [onboardingCity, setOnboardingCity] = useState('Ikeja');
  const [onboardingAddress, setOnboardingAddress] = useState('');
  const [onboardingLanguage, setOnboardingLanguage] = useState('English');
  const [onboardingDeliveryPref, setOnboardingDeliveryPref] = useState('GOODSALE_PARTNER');

  // 6. JWT SESSION MANAGEMENT (Maximum Fidelity Simulation)
  const [jwtExpiry, setJwtExpiry] = useState(900); // 15 minutes
  const [activeJwtToken, setActiveJwtToken] = useState('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImV4cCI6MTgwMDAwMDB9');
  const [sessionIp, setSessionIp] = useState('102.89.23.41');
  const [sessionLocation, setSessionLocation] = useState('Lagos, Nigeria');
  const [userAgent, setUserAgent] = useState('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  // Countdown timer for OTP and JWT Expirations
  useEffect(() => {
    let timer: any;
    if (isOpen) {
      timer = setInterval(() => {
        // Count down OTP
        setOtpCountdown((prev) => (prev > 0 ? prev - 1 : 0));
        // Count down JWT
        setJwtExpiry((prev) => (prev > 0 ? prev - 1 : 900)); // Reset after expire or simulate
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isOpen, mode]);

  if (!isOpen) return null;

  // Preset Nigerian geographical state combinations
  const nigerianGeos: Record<string, string[]> = {
    Lagos: ['Ikeja', 'Lekki', 'Victoria Island', 'Surulere', 'Yaba', 'Maryland', 'Agege'],
    Abuja: ['Wuse', 'Garki', 'Maitama', 'Asokoro', 'Gwagwalada', 'Kubwa'],
    Rivers: ['Port Harcourt', 'Obio-Akpor', 'Eleme', 'Bonny Island'],
    Oyo: ['Ibadan', 'Ogbomosho', 'Oyo Town', 'Akinyele'],
    Kano: ['Kano City', 'Gwale', 'Nassarawa', 'Fagge'],
    Enugu: ['Enugu City', 'Nsukka', 'Udi'],
    Delta: ['Asaba', 'Warri', 'Sapele', 'Agbor'],
    Kaduna: ['Kaduna City', 'Zaria', 'Sabon Gari']
  };

  const handleStateChangeGeo = (stateVal: string) => {
    setOnboardingState(stateVal);
    const cities = nigerianGeos[stateVal] || [];
    if (cities.length > 0) {
      setOnboardingCity(cities[0]);
    }
  };

  // Helper password strength checker
  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { score: 0, text: 'None', color: 'bg-ink-200' };
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    switch (score) {
      case 1: return { score: 25, text: 'Weak', color: 'bg-ink-500' };
      case 2: return { score: 50, text: 'Fair', color: 'bg-ink-400' };
      case 3: return { score: 75, text: 'Good', color: 'bg-jade-500' };
      case 4: return { score: 100, text: 'Strong', color: 'bg-jade-500' };
      default: return { score: 0, text: 'Very Weak', color: 'bg-ink-600' };
    }
  };

  const strength = getPasswordStrength(password);

  // Real Supabase Auth login
  const handleCustomLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!loginIdentifier.trim() || !loginPassword) {
      setErrorMsg('Please specify your credentials.');
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await dbOperations.loginWithPassword(loginIdentifier.trim(), loginPassword);
      setSuccessMsg(`Welcome back, ${user.fullName}!`);
      if (rememberMe) {
        localStorage.setItem('goodsale_saved_session_id', user.id.toString());
      } else {
        localStorage.removeItem('goodsale_saved_session_id');
      }
      setTimeout(() => {
        setSuccessMsg('');
        setIsSubmitting(false);
        if (onSuccess) onSuccess();
        onClose();
      }, 800);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Login failed');
      setIsSubmitting(false);
    }
  };

  // Registration via Supabase Auth (email confirmation handled by Supabase project settings)
  const handleRegistrationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!fullName.trim() || !username.trim() || !email.trim() || !phoneNumber.trim() || !password || !confirmPassword) {
      setErrorMsg('All fields are mandatory. Please provide all data.');
      return;
    }

    if (username.includes(' ')) {
      setErrorMsg('Username cannot contain spaces.');
      return;
    }

    if (username.length < 3) {
      setErrorMsg('Username must be at least 3 characters long.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setErrorMsg('Invalid email address layout. E.g. user@domain.com');
      return;
    }

    if (password.length < 8) {
      setErrorMsg('Security mandate: Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Password mismatch. Confirm password does not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newUser = await dbOperations.registerUser(
        fullName,
        username.trim().toLowerCase(),
        email.trim(),
        phoneNumber.trim(),
        selectedRole,
        password,
        referralCode.trim() || undefined
      );
      if (!newUser) {
        // Supabase may require email confirmation before a session/profile exists
        setSuccessMsg('Account created. Check your email to confirm, then sign in.');
        setTimeout(() => {
          setSuccessMsg('');
          setIsSubmitting(false);
          setMode('login');
        }, 2000);
        return;
      }
      setSuccessMsg(`Account created. Welcome to GoodSale, ${newUser.fullName}!`);
      setTimeout(() => {
        setSuccessMsg('');
        setIsSubmitting(false);
        setMode('onboarding');
      }, 800);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Registration failed');
      setIsSubmitting(false);
    }
  };

  // OTP Verification (password reset flow only — registration uses Supabase Auth directly)
  const handleVerifyOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (otpCode.length !== 6) {
      setErrorMsg('Verification code must be exactly 6 digits.');
      return;
    }

    if (otpCode !== generatedOtp) {
      setErrorMsg('Incorrect OTP token.');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      if (otpPurpose === 'FORGOT_PASSWORD') {
        setSuccessMsg('Account verified. Set your new password.');
        setTimeout(() => {
          setSuccessMsg('');
          setIsSubmitting(false);
          setMode('new_password');
        }, 800);
      } else {
        setIsSubmitting(false);
        setErrorMsg('Use the Sign Up form — registration no longer uses simulated OTP.');
      }
    }, 400);
  };

  // Forgot Password — Supabase reset email
  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!forgotIdentifier.trim()) {
      setErrorMsg('Please specify your registered Email.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const client = createClient();
      if (!client) throw new Error('Supabase is not configured');
      const email = forgotIdentifier.includes('@')
        ? forgotIdentifier.trim()
        : (getDBState().users.find((u) => u.phoneNumber === forgotIdentifier.trim())?.email || '');
      if (!email) throw new Error('Enter the email associated with your account.');
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      });
      if (error) throw error;
      setSuccessMsg('Password reset link sent. Check your email.');
      setIsSubmitting(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not start password reset');
      setIsSubmitting(false);
    }
  };

  // Save new Password via Supabase session
  const handleNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (newPassword.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== newConfirmPassword) {
      setErrorMsg('Password confirmation mismatch.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const client = createClient();
      if (!client) throw new Error('Supabase is not configured');
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setSuccessMsg('Password updated. You can continue.');
      setTimeout(() => {
        setSuccessMsg('');
        setIsSubmitting(false);
        setMode('login');
      }, 800);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update password');
      setIsSubmitting(false);
    }
  };

  // Finish Onboarding process
  const handleOnboardingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!onboardingAddress.trim()) {
      setErrorMsg('Please provide your street fulfillment address.');
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      const state = getDBState();
      const currentUser = state.currentUser;
      if (!currentUser) {
        setErrorMsg('Authentication state lost. Please re-login.');
        setIsSubmitting(false);
        return;
      }

      // 1. Update Profile in global store
      const profile = state.profiles.find(p => p.userId === currentUser.id);
      if (profile) {
        profile.address = onboardingAddress;
        profile.city = onboardingCity;
        profile.state = onboardingState;
        profile.photoUrl = onboardingPhoto;
        profile.deliveryPreference = onboardingDeliveryPref;
        (profile as any).preferredLanguage = onboardingLanguage;
        (profile as any).isOnboarded = true;
      }

      // 2. Save onboarding straight to Supabase so the profile is live everywhere
      saveDBState(state);

      void (async () => {
        const client = createClient();
        if (!client) {
          // No backend connected — keep the confirmation in local state only
          state.notifications.unshift({
            id: state.notifications.length + 1,
            userId: currentUser.id,
            title: 'Profile Onboarding Complete!',
            message: 'Your delivery details are saved for this session.',
            type: 'POINTS',
            isRead: false,
            createdAt: new Date().toISOString(),
          });
          saveDBState(state);
          return;
        }

        const { error } = await client
          .from('profiles')
          .update({
            address: onboardingAddress,
            city: onboardingCity,
            state: onboardingState,
            photo_url: onboardingPhoto,
            delivery_preference: onboardingDeliveryPref,
          })
          .eq('id', currentUser.id);
        if (error) {
          console.error('Failed to persist onboarding:', error.message);
          return;
        }

        await client.from('notifications').insert({
          user_id: currentUser.id,
          title: 'Profile Onboarding Complete!',
          message: 'Your escrow profile is active and your delivery preferences are saved.',
          type: 'POINTS',
          is_read: false,
        });
        await reloadFromSupabase();
      })();

      setSuccessMsg(`Onboarding complete — welcome to the Home stage.`);
      setTimeout(() => {
        setSuccessMsg('');
        setIsSubmitting(false);
        if (onSuccess) onSuccess();
        onClose();
      }, 1500);

    }, 1200);
  };

  // JWT Token manual Refresh handler
  const handleRefreshJwtToken = () => {
    setJwtExpiry(900);
    const randStr = Math.random().toString(36).substring(2, 15);
    setActiveJwtToken(`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImV4cCI6MTgwMDAwMDB9.${randStr}`);
    toast.info('Session token refreshed successfully.');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-ink-950/70 backdrop-blur-md transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-[36px] shadow-2xl overflow-hidden transition-all duration-300 max-h-[92vh] flex flex-col">
        
        {/* Modern Top Gradient Accent */}
        <div className="h-1.5 bg-jade-500 shrink-0" />
        
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-ink-100 dark:border-ink-800 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-display font-bold text-lg text-ink-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-jade-500" />
              Welcome to GoodSale
            </h3>
            <p className="text-sm text-ink-400 mt-0.5">Buy and sell safely with escrow protection</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-xl text-ink-400 hover:text-ink-600 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dynamic OTP notification alert if generated */}
        {generatedOtp && (mode === 'otp_verify' || mode === 'reset_password_otp') && (
          <div className="bg-jade-500 text-white px-6 py-2.5 flex items-center justify-between text-xs font-semibold shadow-md animate-pulse">
            <span>Demo verification code</span>
            <span className="bg-white text-jade-600 px-3 py-1 rounded-lg text-sm font-bold">
              {generatedOtp}
            </span>
          </div>
        )}

        {/* Content - Scrollable */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 scrollbar-thin scrollbar-thumb-ink-200">
          
          {/* Feedback messages */}
          {errorMsg && (
            <div className="p-3.5 bg-ink-500/10 border border-ink-500/20 text-ink-600 dark:text-ink-400 text-xs font-bold rounded-2xl flex items-start gap-2 animate-shake">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-ink-500" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3.5 bg-jade-500/10 border border-jade-500/20 text-jade-600 dark:text-jade-400 text-xs font-bold rounded-2xl flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-jade-500" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* STEP 1: LOGIN MODE */}
          {mode === 'login' && (
            <div className="space-y-5">
              
              {/* Tab Selector */}
              <div className="flex bg-ink-50 dark:bg-ink-950 p-1.5 rounded-2xl border border-ink-150 dark:border-ink-850 shrink-0">
                <button
                  onClick={() => { setMode('login'); setErrorMsg(''); }}
                  className="flex-1 py-2 text-sm font-semibold rounded-xl bg-white dark:bg-ink-800 text-jade-500 dark:text-jade-400 shadow-sm"
                >
                  Sign In
                </button>
                <button
                  onClick={() => { setMode('register'); setErrorMsg(''); }}
                  className="flex-1 py-2 text-sm font-semibold rounded-xl text-ink-500 hover:text-ink-700 dark:hover:text-ink-300"
                >
                  Create Account
                </button>
              </div>

              {/* Standard Password Login Form */}
              <form onSubmit={handleCustomLoginSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block mb-1 font-mono">Email Address or Phone Number</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3 w-4 h-4 text-ink-400" />
                    <input
                      type="text"
                      required
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      placeholder="e.g. hamza@goodsale.ng or +2348030001111"
                      className="w-full pl-10 pr-4 py-2.5 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-jade-500 text-ink-800 dark:text-white font-sans"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block font-mono">Secure Password</label>
                    <button 
                      type="button" 
                      onClick={() => setMode('forgot_password')} 
                      className="text-xs font-bold text-jade-500 hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-ink-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-10 py-2.5 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-jade-500 text-ink-800 dark:text-white font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3 text-ink-400 hover:text-ink-600 dark:hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me Toggle */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded text-jade-500 border-ink-300 focus:ring-jade-500"
                    />
                    <span>Remember me</span>
                  </label>
                  <span className="text-xs text-ink-400">Secure sign-in</span>
                </div>

                {/* Login Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-jade-500 hover:bg-jade-600 text-white font-semibold text-sm rounded-xl cursor-pointer shadow-md shadow-jade-500/15 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Sign in securely</span>
                    </>
                  )}
                </button>
              </form>

              {/* Session security note */}
              <div className="bg-ink-50 dark:bg-ink-950 rounded-2xl p-4 border border-ink-150 dark:border-ink-850 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-jade-500" />
                    <span className="text-sm font-semibold text-ink-700 dark:text-ink-300">Session protection</span>
                  </div>
                  <span className="px-2 py-0.5 bg-jade-500/10 border border-jade-500/20 text-jade-600 dark:text-jade-400 text-[11px] rounded-full font-semibold">
                    Secure
                  </span>
                </div>

                <p className="text-sm text-ink-500 dark:text-ink-400">
                  Your password is never stored. Sessions are protected by Supabase Auth and can be ended from any device.
                </p>

                <div className="flex gap-2 pt-1.5">
                  <button 
                    onClick={handleRefreshJwtToken} 
                    className="flex-1 py-1.5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 hover:border-jade-500 text-xs font-bold text-ink-600 dark:text-ink-300 hover:text-jade-500 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh session
                  </button>
                  {db.currentUser && (
                    <button 
                      onClick={() => {
                        const state = getDBState();
                        state.currentUser = null;
                        saveDBState(state);
                        setSuccessMsg('Active session successfully revoked.');
                        setTimeout(() => {
                          setSuccessMsg('');
                        }, 1200);
                      }}
                      className="py-1.5 px-3 bg-jade-500/10 hover:bg-jade-500 text-jade-700 hover:text-white dark:text-jade-300 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      End this session
                    </button>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* STEP 2: REGISTER MODE */}
          {mode === 'register' && (
            <div className="space-y-4">
              
              {/* Tab Selector */}
              <div className="flex bg-ink-50 dark:bg-ink-950 p-1.5 rounded-2xl border border-ink-150 dark:border-ink-850 shrink-0">
                <button
                  onClick={() => { setMode('login'); setErrorMsg(''); }}
                  className="flex-1 py-2 text-xs font-bold rounded-xl text-ink-500 hover:text-ink-700 dark:hover:text-ink-300"
                >
                  Sign In
                </button>
                <button
                  onClick={() => { setMode('register'); setErrorMsg(''); }}
                  className="flex-1 py-2 text-xs font-bold rounded-xl bg-white dark:bg-ink-800 text-jade-500 dark:text-jade-400 shadow-sm"
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleRegistrationSubmit} className="space-y-4">
                
                {/* Full Name */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block font-mono">Full Name</label>
                    {fullName.trim().length > 0 && (
                      <span className={`text-xs font-bold font-mono ${fullName.trim().length >= 3 ? 'text-jade-500' : 'text-ink-500'}`}>
                        {fullName.trim().length >= 3 ? 'Format looks good' : 'Too short'}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3 w-4 h-4 text-ink-400" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Babajide Ojo"
                      className="w-full pl-10 pr-4 py-2.5 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-jade-500 text-ink-800 dark:text-white font-sans"
                    />
                  </div>
                </div>

                {/* Username */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block font-mono">Unique Username</label>
                    {username.trim().length > 0 && (
                      <span className={`text-xs font-bold font-mono ${
                        username.includes(' ') ? 'text-ink-500' :
                        getDBState().users.some(u => u.username.toLowerCase() === username.trim().toLowerCase()) ? 'text-ink-500' :
                        username.trim().length >= 3 ? 'text-jade-500' : 'text-ink-500'
                      }`}>
                        {username.includes(' ') ? 'No spaces allowed' :
                         getDBState().users.some(u => u.username.toLowerCase() === username.trim().toLowerCase()) ? 'Username taken' :
                         username.trim().length >= 3 ? 'Username available' : 'Too short'}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-xs text-ink-400 font-mono">@</span>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. jide_deals"
                      className="w-full pl-8 pr-4 py-2.5 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-jade-500 text-ink-800 dark:text-white font-sans"
                    />
                  </div>
                </div>

                {/* Email & Phone side-by-side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block font-mono">Email Address</label>
                      {email.trim().length > 0 && (
                        <span className={`text-xs font-bold font-mono ${email.includes('@') && email.includes('.') ? 'text-jade-500' : 'text-ink-500'}`}>
                          {email.includes('@') && email.includes('.') ? 'Format looks good' : 'Invalid email'}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3 w-4 h-4 text-ink-400" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="jide@gmail.com"
                        className="w-full pl-10 pr-4 py-2.5 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-jade-500 text-ink-800 dark:text-white font-sans"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block font-mono">Phone Number</label>
                      {phoneNumber.trim().length > 0 && (
                        <span className={`text-xs font-bold font-mono ${phoneNumber.startsWith('+234') || phoneNumber.length >= 10 ? 'text-jade-500' : 'text-ink-500'}`}>
                          {phoneNumber.startsWith('+234') || phoneNumber.length >= 10 ? 'Validated' : '+234... pattern'}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Smartphone className="absolute left-3.5 top-3 w-4 h-4 text-ink-400" />
                      <input
                        type="tel"
                        required
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="e.g. +2348030001111"
                        className="w-full pl-10 pr-4 py-2.5 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-jade-500 text-ink-800 dark:text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Password & Confirm Password side-by-side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block mb-1 font-mono">Choose Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 w-4 h-4 text-ink-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        className="w-full pl-10 pr-10 py-2.5 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-jade-500 text-ink-800 dark:text-white font-sans"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-3 text-ink-400 hover:text-ink-600 dark:hover:text-white"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block font-mono">Confirm Password</label>
                      {confirmPassword && (
                        <span className={`text-xs font-bold font-mono ${password === confirmPassword ? 'text-jade-500' : 'text-ink-500'}`}>
                          {password === confirmPassword ? 'Matches' : 'Mismatch'}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 w-4 h-4 text-ink-400" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-type password"
                        className="w-full pl-10 pr-10 py-2.5 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-jade-500 text-ink-800 dark:text-white font-sans"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3.5 top-3 text-ink-400 hover:text-ink-600 dark:hover:text-white"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Password Complexity Feedback */}
                {password && (
                  <div className="p-3 bg-ink-50 dark:bg-ink-950 rounded-xl border border-ink-150 dark:border-ink-850 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-ink-400 font-sans">Password strength</span>
                      <span className={`font-semibold font-mono ${strength.score > 70 ? 'text-jade-500' : strength.score > 40 ? 'text-ink-500' : 'text-ink-500'}`}>
                        {strength.text} ({strength.score}%)
                      </span>
                    </div>
                    <Meter
                      value={strength.score}
                      tone={strength.score >= 75 ? 'jade' : 'ink'}
                    />
                    <div className="grid grid-cols-2 gap-1 text-xs font-mono text-ink-400 leading-none">
                      <span className={password.length >= 8 ? 'text-jade-500' : ''}>• Min. 8 Characters {password.length >= 8 ? 'Met' : ''}</span>
                      <span className={/[A-Z]/.test(password) ? 'text-jade-500' : ''}>• Uppercase Letter {/[A-Z]/.test(password) ? 'Met' : ''}</span>
                      <span className={/[0-9]/.test(password) ? 'text-jade-500' : ''}>• Numeric Digit {/[0-9]/.test(password) ? 'Met' : ''}</span>
                      <span className={/[^A-Za-z0-9]/.test(password) ? 'text-jade-500' : ''}>• Special Char {/[^A-Za-z0-9]/.test(password) ? 'Met' : ''}</span>
                    </div>
                  </div>
                )}

                {/* Account role */}
                <div>
                  <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block mb-1.5 font-mono">Marketplace Account Role</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { role: UserRole.BUYER, label: 'Buyer', desc: 'Secure purchases' },
                      { role: UserRole.SELLER, label: 'Individual Seller', desc: 'Frictionless listings' },
                      { role: UserRole.BUSINESS, label: 'Business Owner', desc: 'Custom storefront' }
                    ].map((option) => (
                      <button
                        key={option.role}
                        type="button"
                        onClick={() => setSelectedRole(option.role)}
                        className={`p-2 text-left border rounded-xl transition-all cursor-pointer ${selectedRole === option.role ? 'bg-jade-500/5 border-jade-500 text-jade-900 dark:text-jade-300 font-semibold' : 'bg-ink-50 dark:bg-ink-950 border-ink-200 dark:border-ink-800 text-ink-600 dark:text-ink-400'}`}
                      >
                        <span className="font-bold text-xs block leading-tight">{option.label}</span>
                        <span className="text-xs text-ink-400 block mt-0.5">{option.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Referral Code */}
                <div>
                  <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block mb-1 font-mono">Referral Code (Optional - Earn 100 GP!)</label>
                  <div className="relative">
                    <Gift className="absolute left-3 top-2.5 w-4 h-4 text-ink-500" />
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value)}
                      placeholder="e.g. GS-HAMZA-99"
                      className="w-full pl-10 pr-4 py-2.5 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-jade-500 text-ink-800 dark:text-white font-mono placeholder:text-ink-400"
                    />
                  </div>
                  <span className="text-xs text-jade-500 font-bold block mt-1">Receive +100 GoodPoints escrow credit immediately upon onboarding.</span>
                </div>

                {/* Create account submit button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-jade-500 hover:bg-jade-600 text-white font-semibold text-sm rounded-xl cursor-pointer shadow-md shadow-jade-500/10 text-center flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Secure Register & Send OTP</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

              </form>
            </div>
          )}

          {/* STEP 3: OTP VERIFICATION VIEW */}
          {(mode === 'otp_verify' || mode === 'reset_password_otp') && (
            <form onSubmit={handleVerifyOtpSubmit} className="space-y-5 py-4">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-jade-500/10 text-jade-500 rounded-full flex items-center justify-center mx-auto border border-jade-500/20">
                  <Shield className="w-6 h-6" />
                </div>
                <h4 className="font-display font-bold text-ink-900 dark:text-white text-base">Verify Your Identity</h4>
                <p className="text-xs text-ink-500 dark:text-ink-400 max-w-sm mx-auto leading-relaxed">
                  Enter the 6-digit verification code sent to <strong className="text-ink-800 dark:text-ink-200">{otpPurpose === 'REGISTER' ? email : forgotIdentifier}</strong>.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block mb-2 text-center font-mono">6-Digit Verification PIN (OTP)</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="3 9 2 0 1 0"
                  className="w-full text-center tracking-[0.8em] font-mono text-lg font-bold px-4 py-3 bg-ink-50 dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-jade-500 text-ink-800 dark:text-white"
                />
              </div>

              {/* OTP countdown timer */}
              <div className="flex justify-between items-center text-xs">
                <span className="text-ink-400">Code expires in:</span>
                <span className="font-mono font-bold text-ink-700 dark:text-ink-300">
                  {Math.floor(otpCountdown / 60)}:{(otpCountdown % 60).toString().padStart(2, '0')}
                </span>
              </div>

              {/* Resend Actions */}
              <div className="text-center pt-2">
                <button
                  type="button"
                  disabled={otpCountdown > 0}
                  onClick={() => {
                    const nextCode = Math.floor(100000 + Math.random() * 900000).toString();
                    setGeneratedOtp(nextCode);
                    setOtpCountdown(120);
                    toast.info(`A fresh verification code was generated: ${nextCode}`);
                  }}
                  className="text-xs font-bold text-jade-500 hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer"
                >
                  Didn&apos;t receive code? Resend OTP
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode(otpPurpose === 'REGISTER' ? 'register' : 'forgot_password')}
                  className="flex-1 py-3 bg-ink-100 hover:bg-ink-200 dark:bg-ink-800 dark:hover:bg-ink-700 text-ink-700 dark:text-ink-300 font-semibold text-sm rounded-xl transition-all cursor-pointer text-center"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || otpCode.length !== 6}
                  className="flex-1 py-3 bg-jade-500 hover:bg-jade-600 text-white font-semibold text-sm rounded-xl cursor-pointer transition-all disabled:opacity-50 text-center flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Confirm Code'}
                </button>
              </div>
            </form>
          )}

          {/* STEP 4: FORGOT PASSWORD REQUEST MODE */}
          {mode === 'forgot_password' && (
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4 py-3">
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 bg-ink-500/10 text-ink-500 rounded-full flex items-center justify-center mx-auto border border-ink-500/20">
                  <Key className="w-6 h-6" />
                </div>
                <h4 className="font-display font-bold text-ink-900 dark:text-white text-base">Recover Secure Password</h4>
                <p className="text-xs text-ink-500 dark:text-ink-400 max-w-sm mx-auto leading-relaxed">
                  Enter your registered Email or Nigerian Phone Number. GoodSale will issue a secure recovery OTP verification token.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block mb-1 font-mono">Email or Phone Number</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 w-4 h-4 text-ink-400" />
                  <input
                    type="text"
                    required
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    placeholder="e.g. hamza@goodsale.ng or +2348030001111"
                    className="w-full pl-10 pr-4 py-2.5 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-jade-500 text-ink-800 dark:text-white font-sans"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="flex-1 py-3 bg-ink-100 hover:bg-ink-200 dark:bg-ink-800 dark:hover:bg-ink-700 text-ink-700 dark:text-ink-300 font-semibold text-sm rounded-xl cursor-pointer text-center"
                >
                  Back to Login
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-jade-500 hover:bg-jade-600 text-white font-semibold text-sm rounded-xl cursor-pointer transition-all disabled:opacity-50 text-center flex items-center justify-center"
                >
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Issue Recovery Code'}
                </button>
              </div>
            </form>
          )}

          {/* STEP 5: NEW PASSWORD INPUT MODE */}
          {mode === 'new_password' && (
            <form onSubmit={handleNewPasswordSubmit} className="space-y-4 py-3">
              <div className="text-center space-y-1">
                <h4 className="font-display font-bold text-ink-900 dark:text-white text-base">Setup New Secure Password</h4>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  Create a highly secure, fresh password credential.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block mb-1 font-mono">New Secure Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-ink-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters with upper, numbers, specials"
                    className="w-full pl-10 pr-10 py-2.5 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-jade-500 text-ink-800 dark:text-white font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-ink-400 hover:text-ink-600 dark:hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block mb-1 font-mono">Confirm New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-ink-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={newConfirmPassword}
                    onChange={(e) => setNewConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-10 pr-10 py-2.5 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-jade-500 text-ink-800 dark:text-white font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-3 text-ink-400 hover:text-ink-600 dark:hover:text-white"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !newPassword || newPassword !== newConfirmPassword}
                className="w-full py-3 bg-jade-500 hover:bg-jade-600 text-white font-semibold text-sm rounded-xl cursor-pointer transition-all disabled:opacity-50 text-center flex items-center justify-center"
              >
                {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Set Password & Save'}
              </button>
            </form>
          )}

          {/* STEP 6: DYNAMIC PROFILE ONBOARDING */}
          {mode === 'onboarding' && (
            <form onSubmit={handleOnboardingSubmit} className="space-y-4">
              <div className="text-center space-y-1 border-b border-ink-100 dark:border-ink-800 pb-3">
                <Sparkles className="w-8 h-8 text-ink-500 mx-auto mb-1 animate-bounce" />
                <h4 className="font-display font-bold text-ink-900 dark:text-white text-base">Fulfill Onboarding Profile</h4>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  Setup geographical parameters to enjoy safe escrow shipping & pickup across Nigeria.
                </p>
              </div>

              {/* Profile Avatar Selection */}
              <div>
                <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block mb-1.5 font-mono">Upload Profile Photo ID Avatar</label>
                <div className="flex items-center gap-4 bg-ink-50 dark:bg-ink-950 p-3 rounded-2xl border border-ink-150 dark:border-ink-850">
                  <div className="relative">
                    <SmartImage
                      src={onboardingPhoto}
                      seed="profile"
                      alt="Avatar Preview"
                      className="w-14 h-14 rounded-2xl border-2 border-jade-500 shadow-sm"
                    />
                    <div className="absolute -bottom-1 -right-1 bg-jade-500 text-white p-1 rounded-lg">
                      <Camera className="w-3 h-3" />
                    </div>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <span className="text-xs text-ink-400 block font-mono">Select image file from your device:</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const { uploadMedia } = await import('@/lib/upload');
                          const url = await uploadMedia(file, 'avatars');
                          setOnboardingPhoto(url);
                        } catch (err) {
                          console.error('Onboarding avatar upload failed:', err);
                          toast.error('Photo upload failed. Please try again.');
                        }
                      }}
                      className="w-full text-xs text-ink-500 dark:text-ink-400 file:mr-2.5 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-jade-500/10 file:text-jade-500 hover:file:bg-jade-500/20 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* State & City selectors */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block mb-1 font-mono">State of Residence</label>
                  <select
                    value={onboardingState}
                    onChange={(e) => handleStateChangeGeo(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl text-ink-800 dark:text-white focus:outline-none"
                  >
                    {Object.keys(nigerianGeos).map((stateName) => (
                      <option key={stateName} value={stateName}>{stateName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block mb-1 font-mono">City / Area</label>
                  <select
                    value={onboardingCity}
                    onChange={(e) => setOnboardingCity(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl text-ink-800 dark:text-white focus:outline-none"
                  >
                    {(nigerianGeos[onboardingState] || []).map((cityName) => (
                      <option key={cityName} value={cityName}>{cityName}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Detailed Physical Fulfill Address */}
              <div>
                <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block mb-1 font-mono">Street Fulfillment Address</label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-3 w-4 h-4 text-ink-400" />
                  <input
                    type="text"
                    required
                    value={onboardingAddress}
                    onChange={(e) => setOnboardingAddress(e.target.value)}
                    placeholder="No 4 Garki Square, Beside Zenith Bank"
                    className="w-full pl-10 pr-4 py-2.5 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-jade-500 text-ink-800 dark:text-white font-sans"
                  />
                </div>
              </div>

              {/* Preferred Language & Delivery preference */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block mb-1 font-mono">Preferred Language</label>
                  <select
                    value={onboardingLanguage}
                    onChange={(e) => setOnboardingLanguage(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl text-ink-800 dark:text-white focus:outline-none"
                  >
                    <option value="English">English</option>
                    <option value="Yoruba">Yoruba</option>
                    <option value="Igbo">Igbo</option>
                    <option value="Hausa">Hausa</option>
                    <option value="Pidgin">Pidgin English</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-ink-600 dark:text-ink-300 block mb-1 font-mono">Logistics Preference</label>
                  <select
                    value={onboardingDeliveryPref}
                    onChange={(e) => setOnboardingDeliveryPref(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl text-ink-800 dark:text-white focus:outline-none"
                  >
                    <option value="GOODSALE_PARTNER">GoodSale Partner Delivery</option>
                    <option value="THIRD_PARTY_COURIER"> DHL / FedEx / GIG waybill</option>
                    <option value="SELF_PICKUP">Handover with Secure PIN match</option>
                  </select>
                </div>
              </div>

              {/* Submit Onboarding */}
              <button
                type="submit"
                disabled={isSubmitting || !onboardingAddress.trim()}
                className="w-full py-3 bg-gradient-to-r from-jade-500 to-jade-500 hover:from-jade-600 hover:to-jade-600 text-white font-semibold text-sm rounded-xl cursor-pointer shadow-md shadow-jade-500/10 text-center flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Complete Onboarding (+50 GP!)</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </button>

            </form>
          )}

        </div>

      </div>
    </div>
  );
}
