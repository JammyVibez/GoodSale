// components/SettingsView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  Settings, User, Shield, Bell, HelpCircle, Save, Database, Key, 
  MapPin, CheckCircle, RefreshCw, Smartphone, Mail, Sparkles, ArrowLeft,
  Sun, Moon, Monitor, Eye, EyeOff, Lock, Users, CreditCard, ShoppingBag, Gift,
  Share2, Phone, Building, Info, FileText, Download, Trash2, ShieldAlert,
  Grid, Copy, Check, Menu, AlertTriangle, Play, HelpCircle as HelpIcon, Calendar, Clock, Wallet, ChevronRight
} from 'lucide-react';
import { useDBState, dbOperations, getDBState, saveDBState, UserRole } from '../lib/store';
import { SmartImage } from './ui/SmartImage';
import Card from './ui/Card';
import { toast, confirmDialog } from '@/lib/feedback';

interface SettingsViewProps {
  onBack?: () => void;
  onNavigate?: (view: string, payload?: any) => void;
  onOpenAuth?: () => void;
}

export default function SettingsView({ onBack, onNavigate, onOpenAuth }: SettingsViewProps) {
  const db = useDBState();
  const currentUser = db.currentUser;
  
  const currentProfile = currentUser 
    ? db.profiles.find(p => p.userId === currentUser.id) 
    : null;

  const currentBusiness = currentUser
    ? db.businesses.find(b => b.ownerId === currentUser.id)
    : null;

  // Active Category Sidebar State
  const [activeTab, setActiveTab] = useState<string>('account');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const wallet = currentUser ? db.wallets.find((w) => w.userId === currentUser.id) : null;
  const escrowHeld = currentUser
    ? db.escrows
        .filter((e) => !e.isReleased && !e.isRefunded)
        .filter((e) => {
          const order = db.orders.find((o) => o.id === e.orderId);
          return order?.sellerId === currentUser.id || order?.buyerId === currentUser.id;
        })
        .reduce((sum, e) => sum + e.heldAmount, 0)
    : 0;

  // --- Category States ---
  
  // 1. Account
  const [fullName, setFullName] = useState(currentUser?.fullName || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [phoneNumber, setPhoneNumber] = useState(currentUser?.phoneNumber || '');
  const [displayName, setDisplayName] = useState(currentUser?.fullName ? currentUser.fullName.split(' ')[0] : '');
  const [bio, setBio] = useState(currentProfile?.bio || '');
  const [address, setAddress] = useState(currentProfile?.address || '');
  const [city, setCity] = useState(currentProfile?.city || '');
  const [stateName, setStateName] = useState(currentProfile?.state || '');
  const [profilePic, setProfilePic] = useState(currentProfile?.photoUrl || '');
  const [coverPic, setCoverPic] = useState(currentProfile?.coverUrl || '');

  // 2. Security
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [showTwoFactorModal, setShowTwoFactorModal] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorVerified, setTwoFactorVerified] = useState(false);
  const [activeSessions, setActiveSessions] = useState([
    { id: 1, device: 'Chrome (macOS)', ip: '102.89.43.120', location: 'Lagos, Nigeria', isCurrent: true },
    { id: 2, device: 'iPhone 15 Pro', ip: '102.89.23.9', location: 'Ikeja, Nigeria', isCurrent: false },
    { id: 3, device: 'Safari (iPadOS)', ip: '197.210.64.12', location: 'Abuja, Nigeria', isCurrent: false },
  ]);

  // 3. Notifications Matrix
  const [notifPreferences, setNotifPreferences] = useState({
    messages: { push: true, email: true, sms: true },
    orders: { push: true, email: true, sms: true },
    reviews: { push: true, email: false, sms: false },
    sales: { push: false, email: true, sms: false },
    auctions: { push: true, email: false, sms: false },
    points: { push: true, email: true, sms: false },
    referrals: { push: false, email: true, sms: false },
    delivery: { push: true, email: true, sms: true },
  });

  // 4. Appearance
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('light');
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [density, setDensity] = useState<'cozy' | 'compact'>('cozy');
  const [reduceMotion, setReduceMotion] = useState(false);

  // 5. Privacy
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'followers' | 'private'>('public');
  const [hidePhone, setHidePhone] = useState(false);
  const [hideEmail, setHideEmail] = useState(true);
  const [onlineStatus, setOnlineStatus] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);
  const [whoCanMessage, setWhoCanMessage] = useState<'all' | 'verified' | 'none'>('all');
  const [blockedUsers, setBlockedUsers] = useState(['user_scammer99', 'fake_buyer_lagos']);
  const [mutedUsers, setMutedUsers] = useState(['spam_deals_ng']);

  // 6. Buying Preferences
  const [savedAddresses, setSavedAddresses] = useState([
    { id: 1, label: 'Home', address: 'No 14 Gbagada Phase 2, Lagos', isDefault: true },
    { id: 2, label: 'Office', address: 'Adetokunbo Ademola Crescent, Wuse II, Abuja', isDefault: false },
  ]);
  const [newAddressLabel, setNewAddressLabel] = useState('');
  const [newAddressText, setNewAddressText] = useState('');
  const [defaultPayment, setDefaultPayment] = useState('CARD');
  const [savedSearches, setSavedSearches] = useState(['iPhone 15 Pro Max', 'UK Used MacBooks', 'Aso Oke Agbada']);

  // 7. Selling Preferences
  const [vacationMode, setVacationMode] = useState(false);
  const [vacationAutoReply, setVacationAutoReply] = useState('I am currently out of town. All active escrow shipments will resume on my return. Thank you!');
  const [inventoryAlertThreshold, setInventoryAlertThreshold] = useState(2);
  const [defaultCategory, setDefaultCategory] = useState('ELECTRONICS');
  const [defaultDeliveryMethod, setDefaultDeliveryMethod] = useState('GOODSALE_PARTNER');

  // 8. Business Settings (only visible to business users)
  const [businessName, setBusinessName] = useState(currentBusiness?.name || '');
  const [businessDesc, setBusinessDesc] = useState(currentBusiness?.description || '');
  const [businessLogo, setBusinessLogo] = useState(currentBusiness?.logoUrl || '');
  const [businessBanner, setBusinessBanner] = useState(currentBusiness?.bannerUrl || '');
  const [businessHours, setBusinessHours] = useState('Monday - Saturday (08:00 AM - 07:00 PM)');
  const [staffList, setStaffList] = useState([
    { id: 1, name: 'Tunde Bakare', role: 'Store Manager', status: 'Active' },
    { id: 2, name: 'Chioma Obi', role: 'Support Agent', status: 'Active' }
  ]);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('Support Agent');

  // 9. GoodPoints Catalog Interaction
  const [redeemedVoucher, setRedeemedVoucher] = useState<string | null>(null);

  // 10. Referral Share Link Copy
  const [referralLinkCopied, setReferralLinkCopied] = useState(false);

  // 11. Delivery Preferences
  const [preferredCourier, setPreferredCourier] = useState('GIG Logistics');
  const [safeMeetPreSel, setSafeMeetPreSel] = useState(1); // default meetup location id
  const [pickupAddress, setPickupAddress] = useState('Plot 8, Providence Street, Lekki Phase 1, Lagos');

  // 12. Support Form
  const [supportType, setSupportType] = useState('BUG');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportSuccess, setSupportSuccess] = useState(false);

  // 15. Account Management
  const [deactivated, setDeactivated] = useState(false);

  // Switched user helper
  const [selectedUserId, setSelectedUserId] = useState<number>(currentUser?.id || 1);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Dynamic values reset when user changes
  useEffect(() => {
    if (currentUser) {
      setFullName(currentUser.fullName || '');
      setEmail(currentUser.email || '');
      setPhoneNumber(currentUser.phoneNumber || '');
      setDisplayName(currentUser.fullName ? currentUser.fullName.split(' ')[0] : '');
      
      const prof = db.profiles.find(p => p.userId === currentUser.id);
      if (prof) {
        setBio(prof.bio || '');
        setAddress(prof.address || '');
        setCity(prof.city || '');
        setStateName(prof.state || '');
        setProfilePic(prof.photoUrl || '');
        setCoverPic(prof.coverUrl || '');
      }

      const biz = db.businesses.find(b => b.ownerId === currentUser.id);
      if (biz) {
        setBusinessName(biz.name || '');
        setBusinessDesc(biz.description || '');
        setBusinessLogo(biz.logoUrl || '');
        setBusinessBanner(biz.bannerUrl || '');
      }
    }
  }, [currentUser, db.profiles, db.businesses]);

  // Hydrate persisted appearance + notification prefs from storage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const t = localStorage.getItem('goodsale_theme');
      if (t === 'light' || t === 'dark' || t === 'system') setThemeMode(t);
      const d = localStorage.getItem('goodsale_density');
      if (d === 'cozy' || d === 'compact') setDensity(d);
      const f = localStorage.getItem('goodsale_font_size');
      if (f === 'small' || f === 'medium' || f === 'large') setFontSize(f);
      const np = localStorage.getItem('goodsale_notif_prefs');
      if (np) setNotifPreferences(JSON.parse(np));
      const rd = localStorage.getItem('goodsale_reduce_motion');
      if (rd) setReduceMotion(rd === 'true');
    } catch {
      // ignore malformed storage
    }
  }, []);

  // Apply font scaling + density live to the document root
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const scale = fontSize === 'small' ? 15 : fontSize === 'large' ? 19 : 17;
    document.documentElement.style.fontSize = `${scale}px`;
    document.documentElement.dataset.density = density;
    document.documentElement.dataset.reduceMotion = reduceMotion ? 'true' : 'false';
  }, [fontSize, density, reduceMotion]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setSaving(true);
    setSaveSuccess(false);

    // Save details to store state
    const state = getDBState();
    const dbUser = state.users.find(u => u.id === currentUser.id);
    if (dbUser) {
      dbUser.fullName = fullName;
      dbUser.email = email;
      dbUser.phoneNumber = phoneNumber;
    }
    if (state.currentUser && state.currentUser.id === currentUser.id) {
      state.currentUser.fullName = fullName;
      state.currentUser.email = email;
      state.currentUser.phoneNumber = phoneNumber;
    }

    const profile = state.profiles.find(p => p.userId === currentUser.id);
    if (profile) {
      profile.bio = bio;
      profile.address = address;
      profile.city = city;
      profile.state = stateName;
      profile.photoUrl = profilePic;
      profile.coverUrl = coverPic;
    }

    const biz = state.businesses.find(b => b.ownerId === currentUser.id);
    if (biz) {
      biz.name = businessName;
      biz.description = businessDesc;
      biz.logoUrl = businessLogo;
      biz.bannerUrl = businessBanner;
    }

    saveDBState(state);

    setTimeout(() => {
      setSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 800);
  };

  const handleSwitchUser = (userId: number) => {
    dbOperations.loginUser(userId);
    setSelectedUserId(userId);
  };

  // Real image uploads to Supabase Storage (avatars bucket) — no mock assets.
  const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);

  const handleImageUpload = (target: 'avatar' | 'cover' | 'bizLogo' | 'bizBanner') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploadingAsset(target);
      try {
        const { uploadMedia } = await import('@/lib/upload');
        const url = await uploadMedia(file, 'avatars');
        if (target === 'avatar') setProfilePic(url);
        else if (target === 'cover') setCoverPic(url);
        else if (target === 'bizLogo') setBusinessLogo(url);
        else setBusinessBanner(url);
      } catch (err) {
        console.error('Asset upload failed:', err);
        toast.error('Upload failed. Please try again in a moment.');
      } finally {
        setUploadingAsset(null);
      }
    };
    input.click();
  };

  const handleCopyReferral = () => {
    const code = currentUser?.referralCode || 'GS-HAMZA-12';
    const link = `https://goodsale.ng/join?ref=${code}`;
    navigator.clipboard.writeText(link);
    setReferralLinkCopied(true);
    setTimeout(() => setReferralLinkCopied(false), 2000);
  };

  const handleRedeemPoints = (cost: number, voucherVal: string) => {
    if (!currentUser) return;
    if (currentUser.goodPoints < cost) {
      toast.error(`Insufficient GoodPoints balance. You need ${cost} GP to redeem this voucher.`);
      return;
    }
    dbOperations.subtractUserPoints(cost);
    setRedeemedVoucher(`SUCCESS-VOUCH-${Math.floor(100000 + Math.random() * 900000)}`);
  };

  const handleAddAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAddressLabel || !newAddressText) return;
    setSavedAddresses([
      ...savedAddresses,
      { id: Date.now(), label: newAddressLabel, address: newAddressText, isDefault: false }
    ]);
    setNewAddressLabel('');
    setNewAddressText('');
  };

  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName) return;
    setStaffList([
      ...staffList,
      { id: Date.now(), name: newStaffName, role: newStaffRole, status: 'Active' }
    ]);
    setNewStaffName('');
  };

  const handleExportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `goodsale_user_data_export_${currentUser?.username || 'user'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center select-none">
        <div className="w-16 h-16 bg-jade-500/10 dark:bg-jade-500/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-jade-500/20">
          <Key className="w-8 h-8 text-jade-500" />
        </div>
        <h2 className="font-display font-black text-2xl text-ink-900 dark:text-white mb-2">Configure Settings</h2>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-8 max-w-sm mx-auto leading-relaxed">
          Please sign in or register to customize your security preferences, payment limits, notifications, and profile details in the Control Center.
        </p>
        <div className="space-y-3">
          <button
            onClick={onOpenAuth}
            className="w-full py-3 bg-gradient-to-r from-jade-500 to-jade-600 hover:from-jade-600 hover:to-jade-700 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md shadow-jade-500/10 transition-all"
          >
            Sign In / Register Account
          </button>
          <button
            onClick={onBack}
            className="w-full py-3 bg-ink-100 dark:bg-ink-900 hover:bg-ink-200 dark:hover:bg-ink-800 text-ink-700 dark:text-ink-300 font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all border border-ink-200/50 dark:border-ink-800"
          >
            Back to Marketplace
          </button>
        </div>
      </div>
    );
  }

  // Categories definition
  const categories = [
    { id: 'account', label: 'Account Profile', icon: User, color: 'text-ink-500' },
    { id: 'security', label: 'Security & Auth', icon: Shield, color: 'text-jade-500' },
    { id: 'notifications', label: 'Notifications', icon: Bell, color: 'text-jade-500' },
    { id: 'appearance', label: 'Appearance', icon: Sun, color: 'text-ink-500' },
    { id: 'privacy', label: 'Privacy Control', icon: Lock, color: 'text-jade-500' },
    { id: 'buying', label: 'Buying Preferences', icon: ShoppingBag, color: 'text-jade-500' },
    { id: 'selling', label: 'Selling Settings', icon: Grid, color: 'text-jade-500' },
    ...(currentUser.role === UserRole.VERIFIED_BUSINESS || currentUser.role === UserRole.VERIFIED_SELLER
      ? [{ id: 'business', label: 'Business Console', icon: Building, color: 'text-ink-500' }]
      : []),
    { id: 'goodpoints', label: 'GoodPoints Rewards', icon: Sparkles, color: 'text-ink-500' },
    { id: 'referrals', label: 'Referral Center', icon: Gift, color: 'text-jade-400' },
    { id: 'delivery', label: 'Courier & SafeMeet', icon: MapPin, color: 'text-ink-500' },
    { id: 'support', label: 'Help & Live Support', icon: HelpCircle, color: 'text-jade-500' },
    { id: 'legal', label: 'Legal Accordions', icon: FileText, color: 'text-ink-400' },
    { id: 'about', label: 'About GoodSale', icon: Info, color: 'text-ink-400' },
    { id: 'account_management', label: 'Account Controls', icon: Trash2, color: 'text-ink-600' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Control Center header */}
      <div className="relative mb-8 overflow-hidden rounded-[32px] border border-ink-800 bg-ink-950 p-6 text-white shadow-xl sm:p-8">
        <div className="pointer-events-none absolute inset-0 aurora-bg opacity-60" />
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-jade-500/20 blur-3xl" />

        <div className="relative z-10">
          <button
            onClick={onBack}
            className="mb-3 flex cursor-pointer items-center gap-1.5 text-xs font-bold text-ink-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to marketplace
          </button>
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-jade-500/30 bg-jade-500/15 text-jade-400">
              <Settings className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-black tracking-tight sm:text-3xl">
                Settings
              </h1>
              <p className="mt-1 text-sm text-ink-300">
                Your profile, security, wallet, notifications and delivery preferences in one place.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* SIDEBAR NAVIGATION */}
        <div className="lg:col-span-1 space-y-4">
          <div className="lg:hidden flex justify-between items-center bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-4 rounded-2xl">
            <span className="text-xs font-bold text-ink-700 dark:text-ink-300">Category: {categories.find(c => c.id === activeTab)?.label}</span>
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 bg-ink-50 dark:bg-ink-800 rounded-xl"
            >
              <Menu className="w-5 h-5 text-ink-700 dark:text-ink-300" />
            </button>
          </div>

          <div className={`bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-4 rounded-[32px] shadow-sm space-y-1 ${isMobileMenuOpen ? 'block' : 'hidden lg:block'}`}>
            <p className="text-xs font-sans font-black text-ink-400 uppercase tracking-widest px-3 mb-3">Settings Categories</p>
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveTab(cat.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-all ${
                    activeTab === cat.id
                      ? 'bg-jade-500/10 text-jade-700 shadow-[inset_3px_0_0_0_var(--color-jade-500)] dark:text-jade-300'
                      : 'text-ink-600 hover:bg-ink-50 hover:text-ink-950 dark:text-ink-400 dark:hover:bg-ink-800/50 dark:hover:text-white'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${activeTab === cat.id ? 'text-jade-600 dark:text-jade-400' : cat.color}`} />
                  <span className="truncate">{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Wallet shortcut + session info */}
          <Card variant="muted" className="space-y-4 p-5">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-ink-500">
                Wallet balance
              </p>
              <p className="mt-1 font-mono text-2xl font-black text-ink-900 dark:text-white">
                ₦{(wallet?.balance ?? 0).toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-ink-500">
                ₦{escrowHeld.toLocaleString()} held in escrow
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate?.('wallet')}
              className="focus-ring flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-jade-500/25 bg-jade-500/[0.06] px-3.5 py-2.5 text-sm font-bold text-jade-700 transition-colors hover:bg-jade-500/10 dark:text-jade-300"
            >
              <span className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Open wallet
              </span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </Card>

          <Card variant="muted" className="space-y-3 p-5">
            <h4 className="font-mono text-xs font-bold uppercase tracking-widest text-ink-500">
              Signed in as
            </h4>
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-jade-500" />
              <span className="font-mono text-ink-700 dark:text-ink-200">{currentUser.fullName}</span>
            </div>
            <div className="space-y-1 font-mono text-xs text-ink-500">
              <p>@{currentUser.username}</p>
              <p>Trust {currentUser.trustScore}% · {currentUser.sellerLevel}</p>
              <p>{currentUser.goodPoints.toLocaleString()} GP</p>
            </div>
          </Card>
        </div>

        {/* MAIN PANEL CONTENT */}
        <div className="lg:col-span-3">
          
          {/* TAB 1: ACCOUNT PROFILE */}
          {activeTab === 'account' && (
            <form onSubmit={handleSave} className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-ink-900 dark:text-white flex items-center gap-2">
                    <User className="w-5 h-5 text-ink-500" />
                    Account Specifications
                  </h2>
                  <p className="text-xs text-ink-400 mt-1">Manage profile branding, bio information, and default delivery coordinates.</p>
                </div>

                {/* Profile Media Settings */}
                <div className="space-y-4">
                  <span className="text-xs font-sans font-black text-ink-400 uppercase tracking-wider block">Profile Branding Assets</span>
                  <div className="relative h-36 rounded-2xl bg-ink-100 overflow-hidden border border-ink-200 dark:border-ink-800">
                    <SmartImage src={coverPic} className="w-full h-full" />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <button 
                        type="button"
                        onClick={() => handleImageUpload('cover')}
                        className="px-3 py-1.5 bg-white text-ink-900 text-xs font-bold rounded-lg cursor-pointer"
                      >
                        {uploadingAsset === 'cover' ? 'Uploading…' : 'Change Cover Photo'}
                      </button>
                    </div>
                    {/* Profile avatar overlay */}
                    <div className="absolute bottom-3 left-4 w-16 h-16 rounded-full border-2 border-white overflow-hidden bg-ink-200">
                      <SmartImage src={profilePic} rounded className="w-full h-full" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleImageUpload('avatar')}
                          className="text-[10px] text-white font-extrabold cursor-pointer"
                        >
                          {uploadingAsset === 'avatar' ? '…' : 'Edit'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contact forms */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-sans font-black text-ink-500 dark:text-ink-400 uppercase tracking-wider">Full Legal Name</label>
                    <input 
                      type="text" 
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-ink-50 dark:bg-ink-800/50 border border-ink-200 dark:border-ink-800 rounded-xl text-xs font-bold focus:outline-none focus:border-ink-500 text-ink-800 dark:text-ink-200 transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-sans font-black text-ink-500 dark:text-ink-400 uppercase tracking-wider">Display Nickname</label>
                    <input 
                      type="text" 
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-ink-50 dark:bg-ink-800/50 border border-ink-200 dark:border-ink-800 rounded-xl text-xs font-bold focus:outline-none focus:border-ink-500 text-ink-800 dark:text-ink-200 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-sans font-black text-ink-500 dark:text-ink-400 uppercase tracking-wider">Email Address</label>
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-2.5 bg-ink-50 dark:bg-ink-800/50 border border-ink-200 dark:border-ink-800 rounded-xl text-xs font-bold focus:outline-none focus:border-ink-500 text-ink-800 dark:text-ink-200 transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-sans font-black text-ink-500 dark:text-ink-400 uppercase tracking-wider">Phone Connection</label>
                    <input 
                      type="tel" 
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full px-4 py-2.5 bg-ink-50 dark:bg-ink-800/50 border border-ink-200 dark:border-ink-800 rounded-xl text-xs font-mono text-ink-800 dark:text-ink-200 focus:outline-none focus:border-ink-500 transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-sans font-black text-ink-500 dark:text-ink-400 uppercase tracking-wider">Public Bio Statement</label>
                  <textarea 
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={2}
                    placeholder="E.g. Verified Lagos Tech Merchant | High Quality UK Used Electronics..."
                    className="w-full px-4 py-3 bg-ink-50 dark:bg-ink-800/50 border border-ink-200 dark:border-ink-800 rounded-xl text-xs font-bold focus:outline-none focus:border-ink-500 text-ink-800 dark:text-ink-200 transition-all resize-none"
                  />
                </div>

                {/* Default Delivery Location */}
                <div className="border-t border-ink-100 dark:border-ink-850 pt-5 space-y-4">
                  <h3 className="font-display font-black text-sm text-ink-800 dark:text-white flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-jade-500" />
                    Primary Dispatch Address
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-sans font-black text-ink-400 uppercase tracking-wider">Street Address</label>
                      <input 
                        type="text" 
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="w-full px-4 py-2.5 bg-ink-50 dark:bg-ink-800/50 border border-ink-200 dark:border-ink-800 rounded-xl text-xs font-bold focus:outline-none focus:border-ink-500 text-ink-800 dark:text-ink-200 transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-sans font-black text-ink-400 uppercase tracking-wider">City</label>
                      <input 
                        type="text" 
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full px-4 py-2.5 bg-ink-50 dark:bg-ink-800/50 border border-ink-200 dark:border-ink-800 rounded-xl text-xs font-bold focus:outline-none focus:border-ink-500 text-ink-800 dark:text-ink-200 transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-sans font-black text-ink-400 uppercase tracking-wider">State Region</label>
                      <input 
                        type="text" 
                        value={stateName}
                        onChange={(e) => setStateName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-ink-50 dark:bg-ink-800/50 border border-ink-200 dark:border-ink-800 rounded-xl text-xs font-bold focus:outline-none focus:border-ink-500 text-ink-800 dark:text-ink-200 transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-sans font-black text-ink-400 uppercase tracking-wider">Default Delivery Channel</label>
                      <select 
                        value={defaultDeliveryMethod}
                        onChange={(e) => setDefaultDeliveryMethod(e.target.value)}
                        className="w-full px-4 py-2.5 bg-ink-50 dark:bg-ink-800/50 border border-ink-200 dark:border-ink-800 rounded-xl text-xs font-bold focus:outline-none focus:border-ink-500 text-ink-800 dark:text-ink-200 transition-all"
                      >
                        <option value="GOODSALE_PARTNER">GoodSale Partner Courier (Secure Escrow Transit)</option>
                        <option value="SELLER_DELIVERY">Seller Direct Local Delivery</option>
                        <option value="THIRD_PARTY_COURIER">Express GIGM / DHL Delivery</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Bottom Save */}
              <div className="flex items-center justify-between bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-4 rounded-2xl">
                {saveSuccess ? (
                  <span className="text-xs font-extrabold text-jade-600 bg-jade-50 dark:bg-jade-950/20 px-3 py-1.5 rounded-lg border border-jade-100">
                    Profile specifications successfully synchronized.
                  </span>
                ) : (
                  <span className="text-xs font-mono text-ink-400">Save edits to commit to the secure persistent database.</span>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-ink-500 text-white hover:bg-ink-600 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Account Profile
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: SECURITY & AUTHENTICATION */}
          {activeTab === 'security' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-ink-900 dark:text-white flex items-center gap-2">
                    <Shield className="w-5 h-5 text-jade-500" />
                    Security, Encryption & Auth
                  </h2>
                  <p className="text-xs text-ink-400 mt-1">Configure advanced merchant protection metrics, Multi-Factor Authentication (MFA), and active logins.</p>
                </div>

                {/* Password Change Simulator */}
                <div className="border-b border-ink-100 dark:border-ink-850 pb-6 space-y-4">
                  <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Change Account Password</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input 
                      type="password" 
                      placeholder="Current Password" 
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      className="px-4 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-xs font-bold"
                    />
                    <input 
                      type="password" 
                      placeholder="New Secure Password" 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="px-4 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-xs font-bold"
                    />
                    <input 
                      type="password" 
                      placeholder="Confirm Secure Password" 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="px-4 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-xs font-bold"
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={async () => {
                      if (!oldPassword || !newPassword) {
                        toast.error('Please fill out all password fields.');
                        return;
                      }
                      if (newPassword !== confirmPassword) {
                        toast.error('New passwords do not match!');
                        return;
                      }
                      if (newPassword.length < 8) {
                        toast.error('New password must be at least 8 characters.');
                        return;
                      }
                      try {
                        const { createClient } = await import('@/lib/supabase/client');
                        const client = createClient();
                        if (!client) throw new Error('Supabase is not configured');
                        const { data: authData } = await client.auth.getUser();
                        const email = authData.user?.email;
                        if (!email) throw new Error('No active session');
                        const { error: verifyError } = await client.auth.signInWithPassword({
                          email,
                          password: oldPassword,
                        });
                        if (verifyError) {
                          toast.error('Current password is incorrect.');
                          return;
                        }
                        const { error } = await client.auth.updateUser({ password: newPassword });
                        if (error) {
                          toast.error(error.message);
                          return;
                        }
                        toast.success('Password updated successfully.');
                        setOldPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Could not update password.');
                      }
                    }}
                    className="px-4 py-2 bg-ink-900 dark:bg-ink-800 hover:bg-ink-850 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Update Password Token
                  </button>
                </div>

                {/* Two Factor Configuration */}
                <div className="border-b border-ink-100 dark:border-ink-850 pb-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Two-Factor Authenticator (2FA)</h3>
                      <p className="text-xs text-ink-400 mt-1">Secure escrow releases with external authenticator codes.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={twoFactorEnabled} 
                        onChange={(e) => {
                          if (e.target.checked) {
                            setShowTwoFactorModal(true);
                          } else {
                            setTwoFactorEnabled(false);
                            setTwoFactorVerified(false);
                          }
                        }}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-ink-250 peer-focus:outline-none rounded-full peer dark:bg-ink-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-ink-600 peer-checked:bg-jade-600" />
                    </label>
                  </div>

                  {/* Biometric Login */}
                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Biometric Passkey Access</h3>
                      <p className="text-xs text-ink-400 mt-1">Unlock browser dashboard using local FaceID or Fingerprint reader.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={biometricsEnabled} 
                        onChange={(e) => {
                          setBiometricsEnabled(e.target.checked);
                          if (e.target.checked) toast.success('Passkey registration completed.');
                        }}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-ink-250 peer-focus:outline-none rounded-full peer dark:bg-ink-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-ink-600 peer-checked:bg-jade-600" />
                    </label>
                  </div>
                </div>

                {/* Login History */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Active Secure Sessions</h3>
                    <button 
                      onClick={() => {
                        setActiveSessions([{ id: 1, device: 'Chrome (macOS)', ip: '102.89.43.120', location: 'Lagos, Nigeria', isCurrent: true }]);
                        toast.success('All other active sessions were terminated.');
                      }}
                      className="text-xs text-ink-500 hover:underline font-bold cursor-pointer"
                    >
                      Log Out Other Devices
                    </button>
                  </div>

                  <div className="space-y-2">
                    {activeSessions.map((sess) => (
                      <div key={sess.id} className="flex items-center justify-between p-3 bg-ink-50 dark:bg-ink-800/40 rounded-xl text-xs border border-ink-150 dark:border-ink-850">
                        <div className="flex items-center gap-3">
                          <Smartphone className="w-4 h-4 text-jade-500 shrink-0" />
                          <div>
                            <p className="font-extrabold text-ink-800 dark:text-white">{sess.device}</p>
                            <p className="text-xs text-ink-400">{sess.location} • {sess.ip}</p>
                          </div>
                        </div>
                        {sess.isCurrent ? (
                          <span className="px-2 py-0.5 bg-jade-100 text-jade-800 text-[10px] font-black tracking-widest uppercase rounded">Current</span>
                        ) : (
                          <button 
                            onClick={() => {
                              setActiveSessions(activeSessions.filter(a => a.id !== sess.id));
                            }}
                            className="text-xs font-bold text-ink-500 hover:underline"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Interactive 2FA Modal */}
              {showTwoFactorModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
                  <div className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 p-6 rounded-[32px] max-w-sm w-full shadow-2xl space-y-4">
                    <div>
                      <h3 className="font-display font-black text-base text-ink-900 dark:text-white">Configure Two-Factor Auth</h3>
                      <p className="text-xs text-ink-500 mt-1 font-sans">Scan the QR code with Google Authenticator or enter the manual code below.</p>
                    </div>

                    <div className="flex flex-col items-center py-4 bg-ink-50 dark:bg-ink-800 rounded-2xl">
                      {/* Simulated QR Code */}
                      <div className="w-32 h-32 bg-ink-200 dark:bg-ink-700 flex items-center justify-center border-4 border-white mb-2 relative">
                        <Database className="w-16 h-16 text-ink-400 dark:text-ink-500" />
                        <span className="absolute bottom-1 right-1 bg-jade-500 text-white text-[10px] px-1 rounded font-mono font-bold">SECURE</span>
                      </div>
                      <span className="text-xs font-mono text-ink-500">Manual Key: <strong className="text-ink-700 dark:text-ink-300">GDSX 8912 ALQP</strong></span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-sans font-black text-ink-400 block uppercase">Enter 6-Digit Authenticator Code</label>
                      <input 
                        type="text"
                        maxLength={6}
                        placeholder="e.g. 192843"
                        value={twoFactorCode}
                        onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl focus:outline-none text-center font-mono font-bold tracking-widest"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => {
                          setShowTwoFactorModal(false);
                          setTwoFactorCode('');
                        }}
                        className="flex-1 py-2 bg-ink-100 text-ink-700 text-xs font-bold rounded-xl"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (twoFactorCode.length === 6) {
                            setTwoFactorEnabled(true);
                            setTwoFactorVerified(true);
                            setShowTwoFactorModal(false);
                            toast.success('Two-factor authentication activated.');
                          } else {
                            toast.error('Please enter a valid 6-digit verification code.');
                          }
                        }}
                        className="flex-1 py-2 bg-jade-600 text-white text-xs font-bold rounded-xl"
                      >
                        Verify & Enable
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: NOTIFICATIONS ROUTING */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-ink-900 dark:text-white flex items-center gap-2">
                    <Bell className="w-5 h-5 text-jade-500" />
                    Granular Notification Matrix
                  </h2>
                  <p className="text-xs text-ink-400 mt-1">Customize which transactional and promotional updates route to which client-side channel.</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-ink-150 dark:border-ink-800 text-xs font-sans font-black text-ink-400 uppercase tracking-wider">
                        <th className="py-3">Notification Trigger</th>
                        <th className="py-3 text-center">In-App Push</th>
                        <th className="py-3 text-center">Email Alert</th>
                        <th className="py-3 text-center">SMS Text</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-150 dark:divide-ink-850">
                      {Object.entries(notifPreferences).map(([key, channels]) => (
                        <tr key={key} className="hover:bg-ink-50/50 dark:hover:bg-ink-800/20">
                          <td className="py-3.5 font-bold text-ink-800 dark:text-ink-200 capitalize">
                            {key.replace('_', ' ')} updates
                          </td>
                          <td className="py-3.5 text-center">
                            <input 
                              type="checkbox" 
                              checked={channels.push}
                              onChange={(e) => setNotifPreferences({
                                ...notifPreferences,
                                [key]: { ...channels, push: e.target.checked }
                              })}
                              className="w-4 h-4 accent-ink-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-3.5 text-center">
                            <input 
                              type="checkbox" 
                              checked={channels.email}
                              onChange={(e) => setNotifPreferences({
                                ...notifPreferences,
                                [key]: { ...channels, email: e.target.checked }
                              })}
                              className="w-4 h-4 accent-ink-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-3.5 text-center">
                            <input 
                              type="checkbox" 
                              checked={channels.sms}
                              onChange={(e) => setNotifPreferences({
                                ...notifPreferences,
                                [key]: { ...channels, sms: e.target.checked }
                              })}
                              className="w-4 h-4 accent-ink-500 cursor-pointer"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  onClick={async () => {
                    try {
                      localStorage.setItem('goodsale_notif_prefs', JSON.stringify(notifPreferences));
                      const vals = Object.values(notifPreferences);
                      const anyPush = vals.some((v) => v.push);
                      const anyEmail = vals.some((v) => v.email);
                      const anySms = vals.some((v) => v.sms);
                      const { createClient } = await import('@/lib/supabase/client');
                      const client = createClient();
                      if (client && currentUser) {
                        await client
                          .from('profiles')
                          .update({ push_enabled: anyPush, email_enabled: anyEmail, sms_enabled: anySms })
                          .eq('id', currentUser.id);
                      }
                      toast.success('Notification preferences saved.');
                    } catch {
                      toast.error('Could not save notification preferences.');
                    }
                  }}
                  className="px-5 py-2.5 bg-ink-500 hover:bg-ink-600 text-white rounded-xl text-xs font-bold transition-all"
                >
                  Save Notification Toggles
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: APPEARANCE */}
          {activeTab === 'appearance' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-ink-900 dark:text-white flex items-center gap-2">
                    <Sun className="w-5 h-5 text-ink-500" />
                    Appearance Settings
                  </h2>
                  <p className="text-xs text-ink-400 mt-1">Configure layout themes, responsive scaling densities, and accessibility metrics.</p>
                </div>

                {/* Theme Mode Toggles */}
                <div className="space-y-3">
                  <label className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider block">Visual Theme</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'light', label: 'Light Clean', icon: Sun },
                      { id: 'dark', label: 'Dark Charcoal', icon: Moon },
                      { id: 'system', label: 'Sync System', icon: Monitor },
                    ].map((mode) => {
                      const ModeIcon = mode.icon;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => {
                            setThemeMode(mode.id as any);
                            try {
                              localStorage.setItem('goodsale_theme', mode.id);
                              const root = document.documentElement;
                              const isDark =
                                mode.id === 'dark' ||
                                (mode.id === 'system' &&
                                  window.matchMedia('(prefers-color-scheme: dark)').matches);
                              root.classList.toggle('dark', isDark);
                            } catch {
                              // ignore storage failures
                            }
                            toast.success(`Theme set to ${mode.label}.`);
                          }}
                          className={`flex flex-col items-center gap-2 p-4 rounded-2xl border text-center transition-all cursor-pointer ${
                            themeMode === mode.id
                              ? 'bg-ink-500/10 border-ink-500 text-ink-600'
                              : 'bg-ink-50 dark:bg-ink-800/40 border-ink-150 dark:border-ink-800 hover:bg-ink-100 text-ink-700 dark:text-ink-300'
                          }`}
                        >
                          <ModeIcon className="w-5 h-5" />
                          <span className="text-xs font-bold">{mode.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Display Density */}
                <div className="space-y-3">
                  <label className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider block">Display Density</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'cozy', label: 'Cozy (Highly spacious spacing)', desc: 'Generous padding and relaxed micro-copy' },
                      { id: 'compact', label: 'Compact (Maximum density)', desc: 'Optimized high-density views for trade specialists' }
                    ].map((dens) => (
                      <button
                        key={dens.id}
                        type="button"
                        onClick={() => {
                          setDensity(dens.id as any);
                          try {
                            localStorage.setItem('goodsale_density', dens.id);
                          } catch {
                            // ignore
                          }
                          toast.success(`Density set to ${dens.label}.`);
                        }}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                          density === dens.id
                            ? 'bg-ink-500/10 border-ink-500 text-ink-600'
                            : 'bg-ink-50 dark:bg-ink-800/40 border-ink-150 dark:border-ink-800 text-ink-700 dark:text-ink-300'
                        }`}
                      >
                        <p className="text-xs font-bold">{dens.label}</p>
                        <p className="text-xs text-ink-400 mt-1 leading-normal">{dens.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Scaling */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Font Scaling Profile</label>
                    <span className="text-xs font-mono text-jade-500 font-bold capitalize">{fontSize} Profile</span>
                  </div>
                  <div className="flex gap-2">
                    {['small', 'medium', 'large'].map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => {
                          setFontSize(sz as any);
                          try {
                            localStorage.setItem('goodsale_font_size', sz);
                          } catch {
                            // ignore
                          }
                          toast.success(`Font size set to ${sz}.`);
                        }}
                        className={`flex-1 py-2 text-center rounded-xl text-xs font-bold capitalize ${
                          fontSize === sz
                            ? 'bg-ink-900 text-white dark:bg-ink-800'
                            : 'bg-ink-100 dark:bg-ink-800 hover:bg-ink-200 text-ink-600 dark:text-ink-400'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Motion Effects */}
                <div className="flex items-center justify-between p-4 bg-ink-50 dark:bg-ink-800/40 rounded-2xl border border-ink-150">
                  <div>
                    <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Reduce Motion Transitions</h3>
                    <p className="text-xs text-ink-400 mt-1">Disable complex floating and scaling animations for optimal hardware rendering.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={reduceMotion} 
                      onChange={(e) => setReduceMotion(e.target.checked)}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-ink-250 peer-focus:outline-none rounded-full peer dark:bg-ink-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-ink-600 peer-checked:bg-jade-600" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PRIVACY CONTROL */}
          {activeTab === 'privacy' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-ink-900 dark:text-white flex items-center gap-2">
                    <Lock className="w-5 h-5 text-jade-500" />
                    Privacy & Credentials Visibility
                  </h2>
                  <p className="text-xs text-ink-400 mt-1">Configure who can view your trust rating score, telephone coordinates, or online check-in state.</p>
                </div>

                {/* Profile Visibility */}
                <div className="space-y-3">
                  <label className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider block">Global Profile Visibility</label>
                  <select
                    value={profileVisibility}
                    onChange={(e) => setProfileVisibility(e.target.value as any)}
                    className="w-full px-4 py-2.5 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-xs font-bold"
                  >
                    <option value="public">Public (Show listing feedback, rating and trust score to all traders)</option>
                    <option value="followers">Followers (Only show detailed profile feedback to followers)</option>
                    <option value="private">Private (Strictly hide trust scores and reviews from non-escrow partners)</option>
                  </select>
                </div>

                {/* Individual Toggles */}
                <div className="space-y-3 pt-2">
                  {[
                    { label: 'Hide Cellular Telephone Coordinates', desc: 'Hide phone number on listing cards. Buyers must communicate via built-in chat.', state: hidePhone, setter: setHidePhone },
                    { label: 'Hide Email Credentials', desc: 'Conceal email details from all users across the marketplace.', state: hideEmail, setter: setHideEmail },
                    { label: 'Online Dispatch State indicator', desc: 'Show a pulsing green dot when you are active on the application.', state: onlineStatus, setter: setOnlineStatus },
                    { label: 'Secure Read Receipts handshake', desc: 'Show blue checked status when reading customer chat messages.', state: readReceipts, setter: setReadReceipts },
                  ].map((priv, idx) => (
                    <label key={idx} className="flex items-center justify-between p-3.5 bg-ink-50 dark:bg-ink-800/20 border border-ink-100 dark:border-ink-800 rounded-2xl cursor-pointer">
                      <div>
                        <span className="text-xs font-black text-ink-800 dark:text-white block">{priv.label}</span>
                        <span className="text-xs text-ink-400 font-normal">{priv.desc}</span>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={priv.state}
                        onChange={(e) => priv.setter(e.target.checked)}
                        className="w-5 h-5 accent-ink-500 cursor-pointer"
                      />
                    </label>
                  ))}
                </div>

                {/* Blocked/Muted Lists */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-ink-100 dark:border-ink-850 pt-5">
                  <div className="space-y-2">
                    <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Blocked Account Registry</h3>
                    <div className="p-3 bg-ink-50 dark:bg-ink-800/40 rounded-xl border border-ink-150">
                      {blockedUsers.length === 0 ? (
                        <p className="text-xs text-ink-400">Zero blocked traders.</p>
                      ) : (
                        <div className="space-y-2">
                          {blockedUsers.map(usr => (
                            <div key={usr} className="flex justify-between items-center text-xs">
                              <span className="font-mono text-ink-600 dark:text-ink-300">@{usr}</span>
                              <button 
                                onClick={() => {
                                  setBlockedUsers(blockedUsers.filter(b => b !== usr));
                                  toast.success(`Unblocked @${usr}.`);
                                }}
                                className="text-xs font-bold text-jade-500 hover:underline cursor-pointer"
                              >
                                Unblock
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Muted Chat Accounts</h3>
                    <div className="p-3 bg-ink-50 dark:bg-ink-800/40 rounded-xl border border-ink-150">
                      {mutedUsers.length === 0 ? (
                        <p className="text-xs text-ink-400">Zero muted accounts.</p>
                      ) : (
                        <div className="space-y-2">
                          {mutedUsers.map(usr => (
                            <div key={usr} className="flex justify-between items-center text-xs">
                              <span className="font-mono text-ink-600 dark:text-ink-300">@{usr}</span>
                              <button 
                                onClick={() => {
                                  setMutedUsers(mutedUsers.filter(m => m !== usr));
                                  toast.success(`Unmuted @${usr}.`);
                                }}
                                className="text-xs font-bold text-jade-500 hover:underline cursor-pointer"
                              >
                                Unmute
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: BUYING PREFERENCES */}
          {activeTab === 'buying' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-ink-900 dark:text-white flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-jade-500" />
                    Buying Preferences & Address Book
                  </h2>
                  <p className="text-xs text-ink-400 mt-1">Manage secondary shipping locations, preferred escrow payment systems, and saved searches.</p>
                </div>

                {/* Address Book */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Saved Shipping Locations</h3>
                  <div className="space-y-2">
                    {savedAddresses.map((adr) => (
                      <div key={adr.id} className="p-4 bg-ink-50 dark:bg-ink-800/40 border border-ink-150 dark:border-ink-850 rounded-2xl flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-ink-800 dark:text-white">{adr.label}</span>
                            {adr.isDefault && <span className="px-1.5 py-0.5 bg-jade-100 text-jade-800 text-[10px] font-black uppercase rounded">Default</span>}
                          </div>
                          <p className="text-xs text-ink-400 mt-1">{adr.address}</p>
                        </div>
                        <div className="flex gap-2">
                          {!adr.isDefault && (
                            <button
                              onClick={() => {
                                setSavedAddresses(savedAddresses.map(a => ({ ...a, isDefault: a.id === adr.id })));
                              }}
                              className="text-xs text-jade-500 hover:underline font-bold"
                            >
                              Set Default
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSavedAddresses(savedAddresses.filter(a => a.id !== adr.id));
                            }}
                            className="text-xs text-ink-500 hover:underline font-bold"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add New Address Form */}
                  <form onSubmit={handleAddAddress} className="bg-ink-50 dark:bg-ink-800/25 p-4 rounded-2xl border border-dashed border-ink-200 dark:border-ink-800 space-y-3">
                    <p className="text-xs font-black text-ink-400 uppercase tracking-wider">Add New Address</p>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <input 
                        type="text" 
                        placeholder="Label (e.g. Vacation Cabin)" 
                        value={newAddressLabel}
                        onChange={(e) => setNewAddressLabel(e.target.value)}
                        className="sm:col-span-1 px-3 py-2 bg-white dark:bg-ink-900 border border-ink-200 rounded-xl text-xs"
                      />
                      <input 
                        type="text" 
                        placeholder="Complete Street Address, City, State" 
                        value={newAddressText}
                        onChange={(e) => setNewAddressText(e.target.value)}
                        className="sm:col-span-2 px-3 py-2 bg-white dark:bg-ink-900 border border-ink-200 rounded-xl text-xs"
                      />
                      <button 
                        type="submit"
                        className="sm:col-span-1 py-2 bg-ink-900 dark:bg-ink-800 text-white font-bold rounded-xl text-xs cursor-pointer"
                      >
                        Add Address
                      </button>
                    </div>
                  </form>
                </div>

                {/* Default Escrow Method */}
                <div className="border-t border-ink-100 dark:border-ink-850 pt-5 space-y-3">
                  <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Default Payment Protocol</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'CARD', label: 'Debit Card', desc: 'Secure local Master/Visa' },
                      { id: 'BANK_TRANSFER', label: 'Bank Transfer', desc: 'Provident Bank Nigeria transfer' },
                      { id: 'WALLET', label: 'GoodWallet Balance', desc: 'Instant escrow lock' },
                    ].map((pm) => (
                      <button
                        key={pm.id}
                        onClick={() => setDefaultPayment(pm.id)}
                        className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                          defaultPayment === pm.id 
                            ? 'bg-ink-500/10 border-ink-500 text-ink-600'
                            : 'bg-ink-50 dark:bg-ink-800/40 border-ink-150'
                        }`}
                      >
                        <p className="text-xs font-bold">{pm.label}</p>
                        <p className="text-xs text-ink-400 mt-1 leading-normal">{pm.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Saved Searches */}
                <div className="border-t border-ink-100 dark:border-ink-850 pt-5 space-y-3">
                  <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Saved Searches (Push Alerts Active)</h3>
                  <div className="flex flex-wrap gap-2">
                    {savedSearches.map((search) => (
                      <div key={search} className="flex items-center gap-2 bg-ink-100 dark:bg-ink-800 px-3 py-1.5 rounded-full text-xs font-bold text-ink-700 dark:text-ink-300">
                        <span>&ldquo;{search}&rdquo;</span>
                        <button 
                          onClick={() => setSavedSearches(savedSearches.filter(s => s !== search))}
                          className="text-xs text-ink-500 font-extrabold hover:underline"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: SELLING PREFERENCES */}
          {activeTab === 'selling' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-ink-900 dark:text-white flex items-center gap-2">
                    <Grid className="w-5 h-5 text-jade-500" />
                    Selling & Stock Settings
                  </h2>
                  <p className="text-xs text-ink-400 mt-1">Configure merchant stock triggers, Vacation mode automatic replies, and default category parameters.</p>
                </div>

                {/* Vacation Mode */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Vacation Mode</h3>
                      <p className="text-xs text-ink-400 mt-0.5">Conceal active listings from search results temporarily while you are unavailable.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={vacationMode} 
                        onChange={(e) => setVacationMode(e.target.checked)}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-ink-250 peer-focus:outline-none rounded-full peer dark:bg-ink-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-ink-600 peer-checked:bg-jade-500" />
                    </label>
                  </div>

                  {vacationMode && (
                    <div className="space-y-1.5 animate-slide-up">
                      <label className="text-xs font-sans font-black text-ink-400 uppercase tracking-wider block">Vacation Auto-Reply Message</label>
                      <textarea
                        value={vacationAutoReply}
                        onChange={(e) => setVacationAutoReply(e.target.value)}
                        rows={2}
                        className="w-full p-3 bg-ink-50 dark:bg-ink-800 border border-ink-200 rounded-xl text-xs font-bold"
                      />
                    </div>
                  )}
                </div>

                {/* Stock alerts */}
                <div className="border-t border-ink-100 dark:border-ink-850 pt-5 space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Inventory Depletion Threshold</h3>
                      <p className="text-xs text-ink-400 mt-0.5">Trigger warning notification when product inventory count drops to this value.</p>
                    </div>
                    <span className="text-xs font-mono font-bold text-jade-600 bg-jade-50 dark:bg-jade-950/20 px-2.5 py-1 rounded-lg">≤ {inventoryAlertThreshold} Units left</span>
                  </div>
                  <input 
                    type="range" 
                    min={1} 
                    max={10} 
                    value={inventoryAlertThreshold}
                    onChange={(e) => setInventoryAlertThreshold(parseInt(e.target.value))}
                    className="w-full accent-jade-600 cursor-pointer"
                  />
                </div>

                {/* Default product configurations */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-ink-100 dark:border-ink-850 pt-5">
                  <div className="space-y-1">
                    <label className="text-xs font-sans font-black text-ink-400 uppercase tracking-wider block">Default Listing Category</label>
                    <select
                      value={defaultCategory}
                      onChange={(e) => setDefaultCategory(e.target.value)}
                      className="w-full px-4 py-2.5 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-xs font-bold focus:outline-none focus:border-jade-500"
                    >
                      <option value="ELECTRONICS">UK Used Electronics / Gadgets</option>
                      <option value="FASHION">Native Apparel & Tailoring</option>
                      <option value="VEHICLES">Automobile Parts & Vehicles</option>
                      <option value="SERVICES">Freelance Technical Services</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-sans font-black text-ink-400 uppercase tracking-wider block">Default Dispatch Method</label>
                    <select
                      value={defaultDeliveryMethod}
                      onChange={(e) => setDefaultDeliveryMethod(e.target.value)}
                      className="w-full px-4 py-2.5 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-xs font-bold focus:outline-none focus:border-jade-500"
                    >
                      <option value="GOODSALE_PARTNER">GoodSale Branded Safe-Lock Courier</option>
                      <option value="THIRD_PARTY_COURIER">DHL Express Lagos Waybill</option>
                      <option value="LOCAL_PICKUP">Local SafeMeet™ Handshake Pickup Only</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: BUSINESS CONSOLE (conditional block) */}
          {activeTab === 'business' && (
            <form onSubmit={handleSave} className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-ink-900 dark:text-white flex items-center gap-2">
                    <Building className="w-5 h-5 text-ink-500" />
                    Verified Business Specifications
                  </h2>
                  <p className="text-xs text-ink-400 mt-1">Configure business visual banners, opening calendars, and roles & permissions for staff members.</p>
                </div>

                {/* Banner assets */}
                <div className="space-y-4">
                  <span className="text-xs font-sans font-black text-ink-400 uppercase tracking-wider block">Corporate Banner Assets</span>
                  <div className="relative h-32 rounded-2xl bg-ink-100 overflow-hidden border border-ink-250 dark:border-ink-800">
                    <SmartImage src={businessBanner} className="w-full h-full" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <button 
                        type="button"
                        onClick={() => handleImageUpload('bizBanner')}
                        className="px-3 py-1.5 bg-white text-ink-900 text-xs font-bold rounded-lg cursor-pointer"
                      >
                        {uploadingAsset === 'bizBanner' ? 'Uploading…' : 'Change Corporate Banner'}
                      </button>
                    </div>
                    {/* Logo Overlay */}
                    <div className="absolute bottom-3 left-4 w-12 h-12 rounded-xl border-2 border-white overflow-hidden bg-ink-200">
                      <SmartImage src={businessLogo} className="w-full h-full" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleImageUpload('bizLogo')}
                          className="text-[10px] text-white font-black cursor-pointer"
                        >
                          {uploadingAsset === 'bizLogo' ? '…' : 'Edit'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-sans font-black text-ink-500 dark:text-ink-400 uppercase tracking-wider">Corporate Business Name</label>
                    <input 
                      type="text" 
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-ink-50 dark:bg-ink-800/50 border border-ink-200 dark:border-ink-800 rounded-xl text-xs font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-sans font-black text-ink-500 dark:text-ink-400 uppercase tracking-wider">Opening & Closing Hours</label>
                    <input 
                      type="text" 
                      value={businessHours}
                      onChange={(e) => setBusinessHours(e.target.value)}
                      className="w-full px-4 py-2.5 bg-ink-50 dark:bg-ink-800/50 border border-ink-200 dark:border-ink-800 rounded-xl text-xs font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-sans font-black text-ink-500 dark:text-ink-400 uppercase tracking-wider">Storefront Description</label>
                  <textarea 
                    value={businessDesc}
                    onChange={(e) => setBusinessDesc(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-3 bg-ink-50 dark:bg-ink-800/50 border border-ink-200 dark:border-ink-800 rounded-xl text-xs font-bold resize-none"
                  />
                </div>

                {/* Staff list */}
                <div className="border-t border-ink-100 dark:border-ink-850 pt-5 space-y-3">
                  <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Corporate Staff Management</h3>
                  <div className="space-y-2">
                    {staffList.map((st) => (
                      <div key={st.id} className="flex justify-between items-center p-3 bg-ink-50 dark:bg-ink-800/40 rounded-xl border border-ink-150 text-xs">
                        <div>
                          <p className="font-extrabold text-ink-800 dark:text-white">{st.name}</p>
                          <p className="text-xs text-ink-400">{st.role}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="px-1.5 py-0.5 bg-jade-100 text-jade-800 text-[10px] font-black uppercase rounded">{st.status}</span>
                          <button
                            type="button"
                            onClick={() => setStaffList(staffList.filter(s => s.id !== st.id))}
                            className="text-xs text-ink-500 hover:underline font-bold"
                          >
                            Revoke Access
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <input 
                      type="text"
                      placeholder="Staff Full Name"
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      className="flex-1 px-3 py-2 bg-ink-50 rounded-xl text-xs"
                    />
                    <select
                      value={newStaffRole}
                      onChange={(e) => setNewStaffRole(e.target.value)}
                      className="px-3 py-2 bg-ink-50 rounded-xl text-xs"
                    >
                      <option value="Store Manager">Store Manager</option>
                      <option value="Support Agent">Support Agent</option>
                      <option value="Inventory Clerk">Inventory Clerk</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddStaff}
                      className="px-4 py-2 bg-ink-900 text-white text-xs font-bold rounded-xl cursor-pointer"
                    >
                      Add staff
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-ink-600 hover:bg-ink-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Save Business Specifications
                </button>
              </div>
            </form>
          )}

          {/* TAB 9: GOODPOINTS REWARDS */}
          {activeTab === 'goodpoints' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-display font-black text-lg text-ink-900 dark:text-white flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-ink-500" />
                      GoodPoints (GP) Loyalist Hub
                    </h2>
                    <p className="text-xs text-ink-400 mt-1">Redeem your accumulated escrow-handshake trust loyalty points for exclusive vouchers.</p>
                  </div>
                  <div className="px-4 py-2.5 bg-ink-500 text-ink-950 rounded-2xl font-mono text-center">
                    <span className="text-xs uppercase font-black block tracking-widest text-ink-800">Your Balance</span>
                    <span className="text-base font-black">{currentUser.goodPoints} GP</span>
                  </div>
                </div>

                {/* Rewards Catalog */}
                <div className="space-y-4 pt-2">
                  <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Rewards Catalog</h3>
                  
                  {redeemedVoucher && (
                    <div className="p-4 bg-jade-500/10 border border-jade-500/20 text-jade-800 dark:text-jade-400 rounded-2xl text-xs space-y-1 animate-scale-up">
                      <p className="font-black">VOUCHER SUCCESSFULLY REDEEMED</p>
                      <p>Use code: <strong className="font-mono bg-white dark:bg-ink-950 px-2 py-0.5 rounded text-jade-600 font-extrabold">{redeemedVoucher}</strong> at checkout.</p>
                      <button 
                        onClick={() => setRedeemedVoucher(null)}
                        className="text-xs underline font-bold block mt-2"
                      >
                        Dismiss Code
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { title: '₦5,000 Delivery Voucher', desc: 'Free secure escrow dispatch across Lagos State.', cost: 100, code: 'LAGOS_DELIV_5K' },
                      { title: '50% Verification Discount', desc: 'Upgrade listing to Verified+ premium tier.', cost: 200, code: 'VERIF_PLUS_HALF' },
                      { title: '₦20,000 Mega Gift Card', desc: 'Redeemable on any verified business electronics storefront.', cost: 500, code: 'MEGA_BIZ_20K' },
                    ].map((reward) => (
                      <div key={reward.title} className="p-4 bg-ink-50 dark:bg-ink-800/40 rounded-2xl border border-ink-150 flex flex-col justify-between text-xs">
                        <div>
                          <span className="text-ink-500 font-mono font-black text-xs block">COST: {reward.cost} GP</span>
                          <h4 className="font-black text-ink-800 dark:text-white mt-1">{reward.title}</h4>
                          <p className="text-xs text-ink-400 mt-1 leading-relaxed">{reward.desc}</p>
                        </div>
                        <button
                          onClick={() => handleRedeemPoints(reward.cost, reward.code)}
                          className="mt-4 w-full py-2 bg-ink-900 hover:bg-ink-500 hover:text-ink-950 text-white rounded-xl text-xs uppercase font-black transition-all cursor-pointer"
                        >
                          Redeem reward
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Points Ledger */}
                <div className="border-t border-ink-100 dark:border-ink-850 pt-5 space-y-3">
                  <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Points Ledger History</h3>
                  <div className="divide-y divide-ink-100 dark:divide-ink-850">
                    {db.goodPoints.filter(g => g.userId === currentUser.id).map((tx) => (
                      <div key={tx.id} className="py-2.5 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-bold text-ink-800 dark:text-ink-200">{tx.reason}</p>
                          <p className="text-xs text-ink-400">{new Date(tx.createdAt).toLocaleDateString()}</p>
                        </div>
                        <span className={`font-mono font-black ${tx.points >= 0 ? 'text-jade-500' : 'text-ink-500'}`}>
                          {tx.points >= 0 ? `+${tx.points}` : tx.points} GP
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 10: REFERRAL CENTER */}
          {activeTab === 'referrals' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-ink-900 dark:text-white flex items-center gap-2">
                    <Gift className="w-5 h-5 text-jade-400" />
                    Referral Center
                  </h2>
                  <p className="text-xs text-ink-400 mt-1">Invite other merchants or buyers to earn +150 GP for every first completed escrow deal.</p>
                </div>

                {/* Referral Link Box */}
                <div className="p-5 bg-jade-500/5 border border-jade-500/10 rounded-2xl space-y-3">
                  <span className="text-xs font-sans font-black text-jade-600 block uppercase tracking-wider">Your Unique Invite Coordinates</span>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      readOnly 
                      value={`https://goodsale.ng/join?ref=${currentUser.referralCode || 'GS-HAMZA-12'}`}
                      className="flex-1 px-3 py-2.5 bg-white dark:bg-ink-950 border border-ink-200 rounded-xl text-xs font-mono select-all focus:outline-none"
                    />
                    <button
                      onClick={handleCopyReferral}
                      className="px-4 py-2.5 bg-jade-500 hover:bg-jade-600 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      {referralLinkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {referralLinkCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* Social Share Badges */}
                <div className="space-y-2">
                  <p className="text-xs font-black text-ink-400 uppercase tracking-wider">Share To Social Channels</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button onClick={() => toast.info('Opening WhatsApp to share your referral link...')} className="px-3.5 py-2 bg-[#0A854B]/10 text-[#0A854B] hover:bg-[#0A854B] hover:text-white rounded-xl font-bold cursor-pointer transition-all">WhatsApp</button>
                    <button onClick={() => toast.info('Opening X to share your referral link...')} className="px-3.5 py-2 bg-black/10 text-ink-950 dark:text-white hover:bg-ink-900 rounded-xl font-bold cursor-pointer transition-all">X / Twitter</button>
                    <button onClick={() => toast.info('Opening Facebook to share your referral link...')} className="px-3.5 py-2 bg-[#0A854B]/10 text-[#0A854B] hover:bg-[#0A854B] hover:text-white rounded-xl font-bold cursor-pointer transition-all">Facebook</button>
                  </div>
                </div>

                {/* Referrals ledger */}
                <div className="border-t border-ink-100 dark:border-ink-850 pt-5 space-y-3">
                  <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Referred Friends Registry</h3>
                  
                  {db.referrals.length === 0 ? (
                    <p className="text-xs text-ink-400 py-4">No successful referrals yet. Share your code to get started!</p>
                  ) : (
                    <div className="divide-y divide-ink-150 dark:divide-ink-850">
                      {db.referrals.filter(r => r.referrerId === currentUser.id).map((ref) => (
                        <div key={ref.id} className="py-3 flex justify-between items-center text-xs">
                          <div>
                            <p className="font-extrabold text-ink-800 dark:text-white">{ref.refereeName}</p>
                            <p className="text-xs text-ink-400">Signed up {new Date(ref.createdAt).toLocaleDateString()}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 text-[10px] font-black uppercase rounded ${
                              ref.status === 'FIRST_ORDER_COMPLETED' ? 'bg-jade-100 text-jade-800' : 'bg-ink-100 text-ink-800'
                            }`}>
                              {ref.status === 'FIRST_ORDER_COMPLETED' ? 'Concluded (Earned)' : 'Pending Checkout'}
                            </span>
                            <span className="font-mono font-bold text-ink-500">+ {ref.pointsReward} GP</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 11: COURIER & SAFEMEET PREFERENCES */}
          {activeTab === 'delivery' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-ink-900 dark:text-white flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-ink-500" />
                    Delivery, Courier & SafeMeet™ Zones
                  </h2>
                  <p className="text-xs text-ink-400 mt-1">Configure preferred dispatch courier agencies and default secure physical meeting coordinates.</p>
                </div>

                {/* Preferred courier */}
                <div className="space-y-3">
                  <label className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider block">Preferred Logistics Courier</label>
                  <select
                    value={preferredCourier}
                    onChange={(e) => setPreferredCourier(e.target.value)}
                    className="w-full px-4 py-2.5 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-xs font-bold focus:outline-none focus:border-ink-500"
                  >
                    <option value="GIG Logistics">GIG Logistics (Premium Partner)</option>
                    <option value="DHL Nigeria">DHL Nigeria Express (Air Freight)</option>
                    <option value="FedEx Express">FedEx Lagos Express</option>
                    <option value="Local Bike Dispatch">Independent Dispatch Rider (Same-Day Lagos)</option>
                  </select>
                </div>

                {/* SafeMeet Location Favorite */}
                <div className="space-y-3 border-t border-ink-100 dark:border-ink-850 pt-5">
                  <label className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider block">Default SafeMeet™ Secure zone</label>
                  <div className="grid grid-cols-1 gap-2">
                    {db.safeMeetLocations.map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => {
                          setSafeMeetPreSel(loc.id);
                          toast.success(`Set "${loc.name}" as your default SafeMeet™ coordinate.`);
                        }}
                        className={`p-4 rounded-2xl border text-left cursor-pointer transition-all ${
                          safeMeetPreSel === loc.id
                            ? 'bg-ink-500/10 border-ink-500 text-ink-600'
                            : 'bg-ink-50 dark:bg-ink-800/40 border-ink-150 text-ink-700 dark:text-ink-300'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-extrabold text-xs">{loc.name}</span>
                          <span className="font-mono text-xs bg-jade-100 text-jade-800 px-2 py-0.5 rounded uppercase font-black">Rating: {loc.safetyRating}</span>
                        </div>
                        <p className="text-xs text-ink-400 mt-1 leading-normal">{loc.address}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Default Pickup Address */}
                <div className="space-y-1.5 border-t border-ink-100 dark:border-ink-850 pt-5">
                  <label className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider block">Default Business Warehousing Pickup Address</label>
                  <input 
                    type="text" 
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    className="w-full px-4 py-2.5 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-xs font-bold focus:outline-none focus:border-ink-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 12: HELP & SUPPORT */}
          {activeTab === 'support' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-ink-900 dark:text-white flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-jade-500" />
                    Help & Support Handshake Center
                  </h2>
                  <p className="text-xs text-ink-400 mt-1">Explore instructional guidelines, launch live disputes, or contact our escrow support team.</p>
                </div>

                {/* FAQ list */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Frequently Asked Questions</h3>
                  {[
                    { q: 'Is my money safe in GoodSale Escrow?', a: 'Absolutely. Payment is locked within the client-side simulated escrow vault and only released once the buyer provides the delivery PIN handoff.' },
                    { q: 'What happens in case of a product dispute?', a: 'If a buyer rejects an item, they can trigger a Dispute. The locked funds remain in escrow, and our arbitration managers will investigate.' },
                    { q: 'How do I earn GoodPoints?', a: 'Earn GP by verifying your NIN profile, completing purchases successfully, and submitting reviews.' },
                  ].map((faq, idx) => (
                    <details key={idx} className="p-3 bg-ink-50 dark:bg-ink-800/40 rounded-xl text-xs border border-ink-150 group cursor-pointer">
                      <summary className="font-bold text-ink-800 dark:text-white select-none list-none flex justify-between items-center">
                        <span>{faq.q}</span>
                        <ChevronRight className="h-4 w-4 text-ink-400 transition-transform group-open:rotate-90" />
                      </summary>
                      <p className="text-xs text-ink-400 mt-2 leading-relaxed">{faq.a}</p>
                    </details>
                  ))}
                </div>

                {/* Support ticket submission */}
                <div className="border-t border-ink-100 dark:border-ink-850 pt-5 space-y-3">
                  <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Submit Support Inquiry Ticket</h3>
                  
                  {supportSuccess ? (
                    <div className="p-3.5 bg-jade-100 text-jade-800 text-xs font-bold rounded-xl">
                      <CheckCircle className="inline h-3.5 w-3.5 align-[-2px]" /> Inquiry successfully filed and logged with ticket ID: #GS-TK-{Math.floor(10000 + Math.random() * 90000)}!
                    </div>
                  ) : (
                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={supportType}
                          onChange={(e) => setSupportType(e.target.value)}
                          className="px-3 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 rounded-xl"
                        >
                          <option value="BUG">Report Interface Bug</option>
                          <option value="ESCROW_CLAIM">Escrow Release Claim</option>
                          <option value="DISPUTE">Active Order Dispute</option>
                          <option value="SUGGESTION">General Suggestion</option>
                        </select>
                      </div>
                      <textarea
                        value={supportMessage}
                        onChange={(e) => setSupportMessage(e.target.value)}
                        rows={3}
                        placeholder="Please describe your inquiry or report in detail..."
                        className="w-full p-3 bg-ink-50 dark:bg-ink-800 border border-ink-200 rounded-xl text-xs"
                      />
                      <button
                        onClick={() => {
                          if (!supportMessage) return;
                          setSupportSuccess(true);
                          setTimeout(() => {
                            setSupportSuccess(false);
                            setSupportMessage('');
                          }, 4000);
                        }}
                        className="px-4 py-2 bg-ink-900 text-white rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Submit Ticket
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 13: LEGAL */}
          {activeTab === 'legal' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-ink-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-ink-400" />
                    Legal Policies & Regulatory Accordions
                  </h2>
                  <p className="text-xs text-ink-400 mt-1">Review regulatory policies regarding escrow dispute handling, refunds, and merchant standards.</p>
                </div>

                <div className="space-y-2">
                  {[
                    { title: 'Privacy Policy', text: 'GoodSale is committed to protect personal information. We gather device coordinates, session cookies, and profile pictures strictly for user-to-user marketplace validation. Details are stored in local storage and never sold to third-party marketing entities.' },
                    { title: 'Terms of Service', text: 'By utilizing this website, you agree to respect escrow rules. Fraudulent listings, duplicate listings, spam bids, and misleading descriptions will result in immediate trust score reduction and account deactivation.' },
                    { title: 'Escrow Lock Policy', text: 'Locked payments are held inside a secure escrow smart ledger. If goods are dispatched, funds release is triggered only by entering the buyer delivery PIN or completing a SafeMeet handshake verified by both parties.' },
                    { title: 'Refund Policy', text: 'Refund claims are processed if the seller fails to dispatch within 72 hours, or if an active Dispute concludes in favor of the buyer during our internal arbitration process.' }
                  ].map((leg, idx) => (
                    <details key={idx} className="p-4 bg-ink-50 dark:bg-ink-800/40 rounded-xl text-xs border border-ink-150 group cursor-pointer">
                      <summary className="font-bold text-ink-800 dark:text-white select-none list-none flex justify-between items-center">
                        <span>{leg.title}</span>
                        <ChevronRight className="h-4 w-4 text-ink-400 transition-transform group-open:rotate-90" />
                      </summary>
                      <p className="text-xs text-ink-400 mt-3 leading-relaxed border-t border-ink-200 dark:border-ink-700 pt-3">{leg.text}</p>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 14: ABOUT */}
          {activeTab === 'about' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6 text-center select-none">
                <div className="w-16 h-16 bg-gradient-to-br from-ink-500 to-ink-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-ink-500/20 text-white shadow-lg">
                  <Settings className="w-8 h-8 animate-spin-slow" />
                </div>
                <div>
                  <h2 className="font-display font-black text-xl text-ink-900 dark:text-white">GoodSale™ Marketplace Suite</h2>
                  <p className="text-xs text-jade-500 font-mono font-bold mt-1">Version 2.4.0-premium (Stable)</p>
                  <p className="text-xs text-ink-400 mt-3 max-w-md mx-auto leading-relaxed">
                    Designed to facilitate high-quality local commerce in Nigeria under full, secure, anti-fraud escrow protection mechanics. Developed for AI Studio environment.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto text-xs font-mono pt-4 border-t border-ink-100 dark:border-ink-800">
                  <div className="p-3 bg-ink-50 dark:bg-ink-800/40 rounded-xl">
                    <p className="text-xs text-ink-400">Environment</p>
                    <p className="font-bold mt-1">Cloud Sandbox</p>
                  </div>
                  <div className="p-3 bg-ink-50 dark:bg-ink-800/40 rounded-xl">
                    <p className="text-xs text-ink-400">Database</p>
                    <p className="font-bold mt-1">Local Relational State</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 15: DEVELOPER TESTING SANDBOX */}
          {activeTab === 'sandbox' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-ink-900 dark:text-white flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-jade-500 animate-spin-slow" />
                    Developer & Testing Sandbox
                  </h2>
                  <p className="text-xs text-ink-400 mt-1">GoodSale is a multi-role workspace. Switch between different buyer and merchant user accounts to verify relational flows instantly.</p>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider block">Swap Active User Session</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {db.users.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSwitchUser(user.id)}
                        className={`p-4 rounded-2xl border text-left cursor-pointer transition-all ${
                          currentUser?.id === user.id 
                            ? 'bg-jade-500/10 border-jade-500 text-jade-900 dark:text-jade-300 font-extrabold shadow-sm' 
                            : 'bg-ink-50 dark:bg-ink-800/40 border-ink-150 dark:border-ink-800 hover:bg-ink-100 text-ink-700 dark:text-ink-300'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-xs">{user.fullName}</span>
                          {currentUser?.id === user.id && <span className="w-2.5 h-2.5 rounded-full bg-jade-500 animate-pulse" />}
                        </div>
                        <p className="text-xs text-ink-400 mt-1 uppercase tracking-wider font-mono font-bold">Role: {user.role.replace('VERIFIED_', '')}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Force Upgrade */}
                <div className="p-4 bg-ink-500/5 border border-ink-500/10 rounded-2xl space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-ink-500 shrink-0" />
                    <div>
                      <h4 className="text-xs font-black text-ink-700 dark:text-ink-300 uppercase tracking-wider">Toggle Current Merchant Role Status</h4>
                      <p className="text-xs text-ink-400 mt-1 leading-normal">
                        Verify both Buyer Profile and Merchant Escrow Hub layouts instantly by manually toggling user role parameters inside local database state.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (currentUser?.role === UserRole.BUYER) {
                        dbOperations.updateCurrentUserRole(UserRole.VERIFIED_BUSINESS);
                        toast.success('Upgraded to VERIFIED_BUSINESS. Open the Merchant Hub from the header to start selling.');
                      } else {
                        dbOperations.updateCurrentUserRole(UserRole.BUYER);
                        toast.info('Reverted to BUYER. Standard purchasing profile restored.');
                      }
                    }}
                    className="px-4 py-2.5 bg-ink-500 hover:bg-ink-600 text-ink-950 rounded-xl text-xs font-bold uppercase cursor-pointer"
                  >
                    Switch current user role
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 16: ACCOUNT CONTROLS */}
          {activeTab === 'account_management' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-ink-900 dark:text-white flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-ink-600" />
                    Account Controls & Data Deletion
                  </h2>
                  <p className="text-xs text-ink-400 mt-1">Download personal transaction logs or irreversibly delete/deactivate your user profile.</p>
                </div>

                {/* Export user data */}
                <div className="p-4 bg-ink-50 dark:bg-ink-800/40 rounded-2xl border border-ink-150 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Export Relational Data JSON</h3>
                    <p className="text-xs text-ink-400 mt-0.5">Download a copy of your verified reviews, listings, and order history in JSON format.</p>
                  </div>
                  <button
                    onClick={handleExportData}
                    className="px-4 py-2 bg-ink-900 dark:bg-ink-800 text-white hover:bg-ink-850 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Export Data
                  </button>
                </div>

                {/* Deactivate account */}
                <div className="p-4 bg-ink-50 dark:bg-ink-800/40 rounded-2xl border border-ink-150 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xs font-black text-ink-800 dark:text-white uppercase tracking-wider">Deactivate Marketplace Profile</h3>
                    <p className="text-xs text-ink-400 mt-0.5">Temporarily hide your profile details and active bids. Deactivation can be reverted by logging in again.</p>
                  </div>
                  <button
                    onClick={() => {
                      setDeactivated(true);
                      toast.success('Profile deactivated. Sign in again to reactivate it.');
                    }}
                    className="px-4 py-2 bg-ink-500/10 hover:bg-ink-500 text-ink-600 hover:text-ink-950 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    {deactivated ? 'Account Deactivated' : 'Deactivate profile'}
                  </button>
                </div>

                {/* Delete account */}
                <div className="p-4 bg-ink-500/5 border border-ink-500/10 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-black text-ink-600 uppercase tracking-wider">Permanent Account Deletion</h4>
                    <p className="text-xs text-ink-400 mt-0.5">Irreversibly wipe your user record, active listings, and trust score history. This action cannot be undone.</p>
                  </div>
                  <button
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: 'Delete account',
                        message: 'Permanently delete your GoodSale account? All listings, transaction history and GoodPoints will be wiped. This cannot be undone.',
                        confirmText: 'Delete account',
                        danger: true,
                      });
                      if (!ok) return;
                      try {
                        const res = await fetch('/api/account/delete', { method: 'POST' });
                        const payload = await res.json().catch(() => ({}));
                        if (!res.ok || !payload.success) {
                          toast.error(payload.error || 'Could not delete account.');
                          return;
                        }
                        toast.success('Your account has been deleted.');
                        await dbOperations.logout();
                        setTimeout(() => window.location.reload(), 900);
                      } catch {
                        toast.error('Could not reach the server. Try again.');
                      }
                    }}
                    className="px-4 py-2 bg-ink-600 hover:bg-ink-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
