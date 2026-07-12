// components/AuthModal.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, User, Mail, Smartphone, Shield, Sparkles, Gift, ArrowRight, 
  CheckCircle2, LogIn, Key, Compass, Eye, EyeOff, ShieldAlert, 
  MapPin, Globe, Languages, Camera, RefreshCw, Lock, AlertTriangle, Cpu
} from 'lucide-react';
import { useDBState, dbOperations, UserRole, getDBState, saveDBState } from '../lib/store';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type AuthMode = 'login' | 'register' | 'forgot_password' | 'reset_password_otp' | 'new_password' | 'otp_verify' | 'onboarding';

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const db = useDBState();
  const [mode, setMode] = useState<AuthMode>('login');
  
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
  const [onboardingPhoto, setOnboardingPhoto] = useState('https://picsum.photos/seed/default_avatar/200');
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
    if (!pwd) return { score: 0, text: 'None', color: 'bg-gray-200' };
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    switch (score) {
      case 1: return { score: 25, text: 'Weak', color: 'bg-red-500' };
      case 2: return { score: 50, text: 'Fair', color: 'bg-amber-400' };
      case 3: return { score: 75, text: 'Good', color: 'bg-blue-500' };
      case 4: return { score: 100, text: 'Strong', color: 'bg-emerald-500' };
      default: return { score: 0, text: 'Very Weak', color: 'bg-red-600' };
    }
  };

  const strength = getPasswordStrength(password);

  // Quick Account Login Action
  const handleSimulatedLogin = (userId: number) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      dbOperations.loginUser(userId);
      setSuccessMsg('Logged in successfully!');
      
      // Store credentials if Remember Me is checked
      if (rememberMe) {
        localStorage.setItem('goodsale_saved_session_id', userId.toString());
      } else {
        localStorage.removeItem('goodsale_saved_session_id');
      }

      setTimeout(() => {
        setSuccessMsg('');
        if (onSuccess) onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to authenticate');
    }
  };

  // Standard Login Submission with Password Checks
  const handleCustomLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!loginIdentifier.trim() || !loginPassword) {
      setErrorMsg('Please specify your credentials.');
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      const state = getDBState();
      // Find user by email or phone
      const matchedUser = state.users.find(
        (u) => u.email.toLowerCase() === loginIdentifier.trim().toLowerCase() || u.phoneNumber === loginIdentifier.trim()
      );

      if (!matchedUser) {
        setErrorMsg('Invalid login credentials. User not found.');
        setIsSubmitting(false);
        return;
      }

      // Check password (standard fallback password simulation 'password123' if registered before, or actual matched password)
      const userPwd = (matchedUser as any).password || 'password123';
      if (loginPassword !== userPwd) {
        setErrorMsg('Incorrect secure password. Please try again.');
        setIsSubmitting(false);
        return;
      }

      // Login User
      dbOperations.loginUser(matchedUser.id);
      setSuccessMsg(`Welcome back, ${matchedUser.fullName}! JWT active session established.`);

      if (rememberMe) {
        localStorage.setItem('goodsale_saved_session_id', matchedUser.id.toString());
      } else {
        localStorage.removeItem('goodsale_saved_session_id');
      }

      setTimeout(() => {
        setSuccessMsg('');
        setIsSubmitting(false);
        if (onSuccess) onSuccess();
        onClose();
      }, 1200);
    }, 1000);
  };

  // Registration Submission with field-by-field validations & duplicate checks
  const handleRegistrationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    // Detailed field validations
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

    // 1. Checks duplicate email or phone number in database
    const state = getDBState();
    const isEmailDuplicate = state.users.some(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (isEmailDuplicate) {
      setErrorMsg('This Email Address is already registered. Please utilize another or Sign In.');
      return;
    }

    const isPhoneDuplicate = state.users.some(u => u.phoneNumber === phoneNumber.trim());
    if (isPhoneDuplicate) {
      setErrorMsg('This Phone Number is already associated with an account.');
      return;
    }

    const isUsernameDuplicate = state.users.some(u => u.username.toLowerCase() === username.trim().toLowerCase());
    if (isUsernameDuplicate) {
      setErrorMsg('This Username is already taken. Please customize it.');
      return;
    }

    setIsSubmitting(true);

    // 2. Proceed to simulated secure OTP generation
    setTimeout(() => {
      const generated = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedOtp(generated);
      setOtpCountdown(120);
      setOtpPurpose('REGISTER');
      
      setSuccessMsg(`✓ Validation Completed. Generated secure OTP code has been dispatched to ${email}.`);
      setMode('otp_verify');
      setIsSubmitting(false);
    }, 1200);
  };

  // OTP Verification Submission
  const handleVerifyOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (otpCode.length !== 6) {
      setErrorMsg('Verification code must be exactly 6 digits.');
      return;
    }

    if (otpCode !== generatedOtp) {
      setErrorMsg('Incorrect OTP token. Please enter the correct code shown in the delivery alert.');
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      try {
        if (otpPurpose === 'REGISTER') {
          // Register the user formally inside local state
          const newUser = dbOperations.registerUser(
            fullName,
            username.trim().toLowerCase(),
            email.trim(),
            phoneNumber.trim(),
            selectedRole,
            referralCode.trim() || undefined
          );

          // Store password into database state user object (extending the base schema gracefully)
          const state = getDBState();
          const dbUser = state.users.find(u => u.id === newUser.id);
          if (dbUser) {
            (dbUser as any).password = password;
          }
          saveDBState(state);

          setSuccessMsg(`✓ Verification Approved! Account created. Welcome to GoodSale, ${newUser.fullName}!`);
          
          // Switch to Onboarding page!
          setTimeout(() => {
            setSuccessMsg('');
            setIsSubmitting(false);
            setMode('onboarding');
          }, 1500);

        } else if (otpPurpose === 'FORGOT_PASSWORD') {
          setSuccessMsg('✓ Account Verified! Please set your new secure account password.');
          setTimeout(() => {
            setSuccessMsg('');
            setIsSubmitting(false);
            setMode('new_password');
          }, 1200);
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'An error occurred during account provisioning.');
        setIsSubmitting(false);
      }
    }, 1000);
  };

  // Forgot Password submission
  const handleForgotPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!forgotIdentifier.trim()) {
      setErrorMsg('Please specify your registered Email or Phone.');
      return;
    }

    const state = getDBState();
    const matchedUser = state.users.find(
      u => u.email.toLowerCase() === forgotIdentifier.trim().toLowerCase() || u.phoneNumber === forgotIdentifier.trim()
    );

    if (!matchedUser) {
      setErrorMsg('No active GoodSale account matched this identifier.');
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedOtp(code);
      setOtpCountdown(120);
      setOtpPurpose('FORGOT_PASSWORD');
      
      setSuccessMsg(`✓ Verification SMS & Email sent to ${forgotIdentifier}.`);
      setMode('reset_password_otp');
      setIsSubmitting(false);
    }, 1200);
  };

  // Save new Password
  const handleNewPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (newPassword.length < 8) {
      setErrorMsg('Password must be at least 8 characters long for corporate security guidelines.');
      return;
    }

    if (newPassword !== newConfirmPassword) {
      setErrorMsg('Password confirmation mismatch. Check matching strings.');
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      const state = getDBState();
      // Find user that matches the forgot token identifier
      const matchedUser = state.users.find(
        u => u.email.toLowerCase() === forgotIdentifier.trim().toLowerCase() || u.phoneNumber === forgotIdentifier.trim()
      );

      if (matchedUser) {
        (matchedUser as any).password = newPassword;
        saveDBState(state);
        setSuccessMsg('✓ Password successfully updated! Please login with your new credentials.');
        
        setTimeout(() => {
          setSuccessMsg('');
          setIsSubmitting(false);
          setMode('login');
        }, 1500);
      } else {
        setErrorMsg('Fatal session mismatch. Please restart the reset process.');
        setIsSubmitting(false);
      }
    }, 1200);
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

      // 2. Award +50 Loyalty GoodPoints for profile completion
      currentUser.goodPoints += 50;
      const dbUser = state.users.find(u => u.id === currentUser.id);
      if (dbUser) {
        dbUser.goodPoints += 50;
      }

      // 3. Post system notification
      state.notifications.unshift({
        id: state.notifications.length + 1,
        userId: currentUser.id,
        title: 'Profile Onboarding Complete!',
        message: 'Congratulations! Your escrow profile is active. You have been credited with +50 GoodPoints for completion.',
        type: 'POINTS',
        isRead: false,
        createdAt: new Date().toISOString()
      });

      saveDBState(state);

      setSuccessMsg(`✓ Onboarding Complete! Welcome to the Home stage.`);
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
    alert('Simulated Token Rotation Completed: Simulated Refresh Token rotated successfully and rotated the Access Token cookies.');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-md transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-[36px] shadow-2xl overflow-hidden transition-all duration-300 max-h-[92vh] flex flex-col">
        
        {/* Modern Top Gradient Accent */}
        <div className="h-2.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 shrink-0" />
        
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-500" />
              GoodSale Secure Identity Portal
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Escrow, Commerce & Logistics Platform in Nigeria</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dynamic OTP notification alert if generated */}
        {generatedOtp && (mode === 'otp_verify' || mode === 'reset_password_otp') && (
          <div className="bg-emerald-500 text-white px-6 py-2.5 flex items-center justify-between text-xs font-bold font-mono shadow-md animate-pulse">
            <span>🔐 SIMULATED OTP DISPATCHED:</span>
            <span className="bg-white text-emerald-600 px-3 py-1 rounded-lg text-sm font-black tracking-widest">
              {generatedOtp}
            </span>
          </div>
        )}

        {/* Content - Scrollable */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 scrollbar-thin scrollbar-thumb-gray-200">
          
          {/* Feedback messages */}
          {errorMsg && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold rounded-2xl flex items-start gap-2 animate-shake">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-2xl flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* STEP 1: LOGIN MODE */}
          {mode === 'login' && (
            <div className="space-y-5">
              
              {/* Tab Selector */}
              <div className="flex bg-gray-50 dark:bg-slate-950 p-1.5 rounded-2xl border border-gray-150 dark:border-slate-850 shrink-0">
                <button
                  onClick={() => { setMode('login'); setErrorMsg(''); }}
                  className="flex-1 py-2 text-xs font-bold rounded-xl bg-white dark:bg-slate-800 text-emerald-500 dark:text-emerald-400 shadow-sm"
                >
                  Sign In
                </button>
                <button
                  onClick={() => { setMode('register'); setErrorMsg(''); }}
                  className="flex-1 py-2 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Create Account
                </button>
              </div>

              {/* Standard Password Login Form */}
              <form onSubmit={handleCustomLoginSubmit} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 font-mono">Email Address or Phone Number</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      placeholder="e.g. hamza@goodsale.ng or +2348030001111"
                      className="w-full pl-10 pr-4 py-2.5 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-white font-sans"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-mono">Secure Password</label>
                    <button 
                      type="button" 
                      onClick={() => setMode('forgot_password')} 
                      className="text-[10px] font-bold text-emerald-500 hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-10 py-2.5 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-white font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me Toggle */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 border-gray-300 focus:ring-emerald-500"
                    />
                    <span>Remember My Session</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">15m JWT Session</span>
                </div>

                {/* Login Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md shadow-emerald-500/10 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Authenticate Account</span>
                    </>
                  )}
                </button>
              </form>

              {/* JWT Session Manager Panel */}
              <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-4 border border-gray-150 dark:border-slate-850 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-emerald-500" />
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest font-mono">JWT Session Auditor</span>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[8px] font-mono rounded font-bold uppercase tracking-wider">
                    Secured
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[10px] font-mono text-slate-500 dark:text-slate-400 leading-normal">
                  <div>
                    <span className="font-sans font-bold text-slate-400 block">ACCESS TOKEN EXPIRY</span>
                    <span className="text-slate-800 dark:text-slate-200 font-extrabold">{Math.floor(jwtExpiry / 60)}m {jwtExpiry % 60}s</span>
                  </div>
                  <div>
                    <span className="font-sans font-bold text-slate-400 block">IP ADDRESS</span>
                    <span className="text-slate-800 dark:text-slate-200">{sessionIp} ({sessionLocation})</span>
                  </div>
                  <div className="col-span-2">
                    <span className="font-sans font-bold text-slate-400 block">JWT DECODED HEADER & CLAIM</span>
                    <span className="text-[9px] block text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-850 p-1.5 rounded font-mono truncate">
                      {activeJwtToken}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 pt-1.5">
                  <button 
                    onClick={handleRefreshJwtToken} 
                    className="flex-1 py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 hover:border-emerald-500 text-[9px] font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-500 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Rotate Session Refresh Token
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
                      className="py-1.5 px-3 bg-red-500/10 hover:bg-red-500 text-red-600 hover:text-white text-[9px] font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Revoke JWT
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
              <div className="flex bg-gray-50 dark:bg-slate-950 p-1.5 rounded-2xl border border-gray-150 dark:border-slate-850 shrink-0">
                <button
                  onClick={() => { setMode('login'); setErrorMsg(''); }}
                  className="flex-1 py-2 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Sign In
                </button>
                <button
                  onClick={() => { setMode('register'); setErrorMsg(''); }}
                  className="flex-1 py-2 text-xs font-bold rounded-xl bg-white dark:bg-slate-800 text-emerald-500 dark:text-emerald-400 shadow-sm"
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleRegistrationSubmit} className="space-y-4">
                
                {/* Full Name */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-mono">Full Name</label>
                    {fullName.trim().length > 0 && (
                      <span className={`text-[9px] font-bold font-mono ${fullName.trim().length >= 3 ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {fullName.trim().length >= 3 ? '✓ Format OK' : '⚠️ Too short'}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Babajide Ojo"
                      className="w-full pl-10 pr-4 py-2.5 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-white font-sans"
                    />
                  </div>
                </div>

                {/* Username */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-mono">Unique Username</label>
                    {username.trim().length > 0 && (
                      <span className={`text-[9px] font-bold font-mono ${
                        username.includes(' ') ? 'text-red-500' :
                        getDBState().users.some(u => u.username.toLowerCase() === username.trim().toLowerCase()) ? 'text-red-500' :
                        username.trim().length >= 3 ? 'text-emerald-500' : 'text-amber-500'
                      }`}>
                        {username.includes(' ') ? '⚠️ No spaces allowed' :
                         getDBState().users.some(u => u.username.toLowerCase() === username.trim().toLowerCase()) ? '❌ Username taken' :
                         username.trim().length >= 3 ? '✓ Username available' : '⚠️ Too short'}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-xs text-slate-400 font-mono">@</span>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. jide_deals"
                      className="w-full pl-8 pr-4 py-2.5 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-white font-sans"
                    />
                  </div>
                </div>

                {/* Email & Phone side-by-side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-mono">Email Address</label>
                      {email.trim().length > 0 && (
                        <span className={`text-[9px] font-bold font-mono ${email.includes('@') && email.includes('.') ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {email.includes('@') && email.includes('.') ? '✓ Format OK' : '⚠️ Invalid email'}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="jide@gmail.com"
                        className="w-full pl-10 pr-4 py-2.5 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-white font-sans"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-mono">Phone Number</label>
                      {phoneNumber.trim().length > 0 && (
                        <span className={`text-[9px] font-bold font-mono ${phoneNumber.startsWith('+234') || phoneNumber.length >= 10 ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {phoneNumber.startsWith('+234') || phoneNumber.length >= 10 ? '✓ Validated' : '⚠️ +234... pattern'}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Smartphone className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="tel"
                        required
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="e.g. +2348030001111"
                        className="w-full pl-10 pr-4 py-2.5 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Password & Confirm Password side-by-side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 font-mono">Choose Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        className="w-full pl-10 pr-10 py-2.5 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-white font-sans"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-mono">Confirm Password</label>
                      {confirmPassword && (
                        <span className={`text-[9px] font-bold font-mono ${password === confirmPassword ? 'text-emerald-500' : 'text-red-500'}`}>
                          {password === confirmPassword ? '✓ Matches' : '❌ Mismatch'}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-type password"
                        className="w-full pl-10 pr-10 py-2.5 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-white font-sans"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Password Complexity Feedback */}
                {password && (
                  <div className="p-3 bg-gray-50 dark:bg-slate-950 rounded-xl border border-gray-150 dark:border-slate-850 space-y-2">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-slate-400 font-sans">PASSWORD STRENGTH STATS</span>
                      <span className={`font-extrabold font-mono ${strength.score > 70 ? 'text-emerald-500' : strength.score > 40 ? 'text-amber-500' : 'text-red-500'}`}>
                        {strength.text} ({strength.score}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full ${strength.color} transition-all duration-300`} style={{ width: `${strength.score}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[9px] font-mono text-slate-400 leading-none">
                      <span className={password.length >= 8 ? 'text-emerald-500' : ''}>• Min. 8 Characters {password.length >= 8 ? '✓' : ''}</span>
                      <span className={/[A-Z]/.test(password) ? 'text-emerald-500' : ''}>• Uppercase Letter {/[A-Z]/.test(password) ? '✓' : ''}</span>
                      <span className={/[0-9]/.test(password) ? 'text-emerald-500' : ''}>• Numeric Digit {/[0-9]/.test(password) ? '✓' : ''}</span>
                      <span className={/[^A-Za-z0-9]/.test(password) ? 'text-emerald-500' : ''}>• Special Char {/[^A-Za-z0-9]/.test(password) ? '✓' : ''}</span>
                    </div>
                  </div>
                )}

                {/* Account role */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1.5 font-mono">Marketplace Account Role</label>
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
                        className={`p-2 text-left border rounded-xl transition-all cursor-pointer ${selectedRole === option.role ? 'bg-emerald-500/5 border-emerald-500 text-emerald-900 dark:text-emerald-300 font-semibold' : 'bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'}`}
                      >
                        <span className="font-bold text-xs block leading-tight">{option.label}</span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">{option.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Referral Code */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 font-mono">Referral Code (Optional - Earn 100 GP!)</label>
                  <div className="relative">
                    <Gift className="absolute left-3 top-2.5 w-4 h-4 text-amber-500" />
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value)}
                      placeholder="e.g. GS-HAMZA-99"
                      className="w-full pl-10 pr-4 py-2.5 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-white font-mono placeholder:text-slate-400"
                    />
                  </div>
                  <span className="text-[9px] text-emerald-500 font-bold block mt-1">✓ Receive +100 GoodPoints escrow credit immediately upon onboarding.</span>
                </div>

                {/* Create account submit button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md shadow-emerald-500/10 text-center flex items-center justify-center gap-2 transition-all disabled:opacity-50"
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
                <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                  <Shield className="w-6 h-6" />
                </div>
                <h4 className="font-display font-black text-slate-900 dark:text-white text-base">Verify Your Identity</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Enter the 6-digit verification code sent to <strong className="text-slate-800 dark:text-slate-200">{otpPurpose === 'REGISTER' ? email : forgotIdentifier}</strong>.
                </p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2 text-center font-mono">6-Digit Verification PIN (OTP)</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="3 9 2 0 1 0"
                  className="w-full text-center tracking-[0.8em] font-mono text-lg font-black px-4 py-3 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                />
              </div>

              {/* OTP countdown timer */}
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Code expires in:</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
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
                    alert(`Simulated OTP re-sent successfully: Check the top alert for OTP: ${nextCode}`);
                  }}
                  className="text-xs font-bold text-emerald-500 hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer"
                >
                  Didn&apos;t receive code? Resend OTP
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode(otpPurpose === 'REGISTER' ? 'register' : 'forgot_password')}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-sans font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer text-center"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || otpCode.length !== 6}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all disabled:opacity-50 text-center flex items-center justify-center gap-2"
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
                <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mx-auto border border-amber-500/20">
                  <Key className="w-6 h-6" />
                </div>
                <h4 className="font-display font-black text-slate-900 dark:text-white text-base">Recover Secure Password</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Enter your registered Email or Nigerian Phone Number. GoodSale will issue a secure recovery OTP verification token.
                </p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 font-mono">Email or Phone Number</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    placeholder="e.g. hamza@goodsale.ng or +2348030001111"
                    className="w-full pl-10 pr-4 py-2.5 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-white font-sans"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer text-center"
                >
                  Back to Login
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all disabled:opacity-50 text-center flex items-center justify-center"
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
                <h4 className="font-display font-black text-slate-900 dark:text-white text-base">Setup New Secure Password</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Create a highly secure, fresh password credential.
                </p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 font-mono">New Secure Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters with upper, numbers, specials"
                    className="w-full pl-10 pr-10 py-2.5 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-white font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 font-mono">Confirm New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={newConfirmPassword}
                    onChange={(e) => setNewConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-10 pr-10 py-2.5 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-white font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !newPassword || newPassword !== newConfirmPassword}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all disabled:opacity-50 text-center flex items-center justify-center"
              >
                {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Set Password & Save'}
              </button>
            </form>
          )}

          {/* STEP 6: DYNAMIC PROFILE ONBOARDING */}
          {mode === 'onboarding' && (
            <form onSubmit={handleOnboardingSubmit} className="space-y-4">
              <div className="text-center space-y-1 border-b border-gray-100 dark:border-slate-800 pb-3">
                <Sparkles className="w-8 h-8 text-amber-500 mx-auto mb-1 animate-bounce" />
                <h4 className="font-display font-black text-slate-900 dark:text-white text-base">Fulfill Onboarding Profile</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Setup geographical parameters to enjoy safe escrow shipping & pickup across Nigeria.
                </p>
              </div>

              {/* Profile Avatar Selection */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1.5 font-mono">Upload Profile Photo ID Avatar</label>
                <div className="flex items-center gap-4 bg-gray-50 dark:bg-slate-950 p-3 rounded-2xl border border-gray-150 dark:border-slate-850">
                  <div className="relative">
                    <img
                      src={onboardingPhoto}
                      alt="Avatar Preview"
                      className="w-14 h-14 rounded-2xl object-cover border-2 border-emerald-500 shadow-sm"
                    />
                    <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white p-1 rounded-lg">
                      <Camera className="w-3 h-3" />
                    </div>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <span className="text-[10px] text-slate-400 block font-mono">Select image file from your device:</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setOnboardingPhoto(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="w-full text-xs text-slate-500 dark:text-slate-400 file:mr-2.5 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-emerald-500/10 file:text-emerald-500 hover:file:bg-emerald-500/20 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* State & City selectors */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 font-mono">State of Residence</label>
                  <select
                    value={onboardingState}
                    onChange={(e) => handleStateChangeGeo(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                  >
                    {Object.keys(nigerianGeos).map((stateName) => (
                      <option key={stateName} value={stateName}>{stateName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 font-mono">City / Area</label>
                  <select
                    value={onboardingCity}
                    onChange={(e) => setOnboardingCity(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                  >
                    {(nigerianGeos[onboardingState] || []).map((cityName) => (
                      <option key={cityName} value={cityName}>{cityName}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Detailed Physical Fulfill Address */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 font-mono">Street Fulfillment Address</label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={onboardingAddress}
                    onChange={(e) => setOnboardingAddress(e.target.value)}
                    placeholder="No 4 Garki Square, Beside Zenith Bank"
                    className="w-full pl-10 pr-4 py-2.5 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-white font-sans"
                  />
                </div>
              </div>

              {/* Preferred Language & Delivery preference */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 font-mono">Preferred Language</label>
                  <select
                    value={onboardingLanguage}
                    onChange={(e) => setOnboardingLanguage(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                  >
                    <option value="English">English</option>
                    <option value="Yoruba">Yoruba</option>
                    <option value="Igbo">Igbo</option>
                    <option value="Hausa">Hausa</option>
                    <option value="Pidgin">Pidgin English</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 font-mono">Logistics Preference</label>
                  <select
                    value={onboardingDeliveryPref}
                    onChange={(e) => setOnboardingDeliveryPref(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-white focus:outline-none"
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
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md shadow-emerald-500/10 text-center flex items-center justify-center gap-2 transition-all disabled:opacity-50"
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
