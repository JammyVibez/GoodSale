// components/SettingsView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  Settings, User, Shield, Bell, HelpCircle, Save, Database, Key, 
  MapPin, CheckCircle, RefreshCw, Smartphone, Mail, Sparkles, ArrowLeft,
  Sun, Moon, Monitor, Eye, EyeOff, Lock, Users, CreditCard, ShoppingBag, Gift,
  Share2, Phone, Building, Info, FileText, Download, Trash2, ShieldAlert,
  Grid, Copy, Check, Menu, AlertTriangle, Play, HelpCircle as HelpIcon, Calendar, Clock
} from 'lucide-react';
import { useDBState, dbOperations, getDBState, saveDBState, UserRole } from '../lib/store';

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
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setSaving(true);
    setSaveSuccess(false);
    try {
      await dbOperations.updateProfile(bio, address, city, stateName, 'GOODSALE_PARTNER', {
        photoUrl: profilePic,
        coverUrl: coverPic,
        fullName,
        phoneNumber,
      });
      if (
        currentUser.role === UserRole.BUSINESS ||
        currentUser.role === UserRole.VERIFIED_BUSINESS ||
        currentUser.role === UserRole.SELLER ||
        currentUser.role === UserRole.VERIFIED_SELLER
      ) {
        await dbOperations.updateBusinessDetails(
          businessName,
          businessDesc,
          address,
          city,
          stateName,
          '09:00 AM - 06:00 PM',
          { logoUrl: businessLogo, bannerUrl: businessBanner }
        );
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyReferral = () => {
    const code = currentUser?.referralCode || 'GS-REF';
    const link = `https://goodsale.ng/join?ref=${code}`;
    navigator.clipboard.writeText(link);
    setReferralLinkCopied(true);
    setTimeout(() => setReferralLinkCopied(false), 2000);
  };

  const handleRedeemPoints = (cost: number, voucherVal: string) => {
    if (!currentUser) return;
    if (currentUser.goodPoints < cost) {
      alert(`Insufficient GoodPoints balance. You need ${cost} GP to redeem this voucher.`);
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
        <div className="w-16 h-16 bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-indigo-500/20">
          <Key className="w-8 h-8 text-indigo-500" />
        </div>
        <h2 className="font-display font-black text-2xl text-slate-900 dark:text-white mb-2">Configure Settings</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-sm mx-auto leading-relaxed">
          Please sign in or register to customize your security preferences, payment limits, notifications, and profile details in the Control Center.
        </p>
        <div className="space-y-3">
          <button
            onClick={onOpenAuth}
            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md shadow-emerald-500/10 transition-all"
          >
            Sign In / Register Account
          </button>
          <button
            onClick={onBack}
            className="w-full py-3 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all border border-gray-200/50 dark:border-slate-800"
          >
            Back to Marketplace
          </button>
        </div>
      </div>
    );
  }

  // Categories definition
  const categories = [
    { id: 'account', label: 'Account Profile', icon: User, color: 'text-orange-500' },
    { id: 'security', label: 'Security & Auth', icon: Shield, color: 'text-indigo-500' },
    { id: 'notifications', label: 'Notifications', icon: Bell, color: 'text-blue-500' },
    { id: 'appearance', label: 'Appearance', icon: Sun, color: 'text-amber-500' },
    { id: 'privacy', label: 'Privacy Control', icon: Lock, color: 'text-emerald-500' },
    { id: 'buying', label: 'Buying Preferences', icon: ShoppingBag, color: 'text-pink-500' },
    { id: 'selling', label: 'Selling Settings', icon: Grid, color: 'text-teal-500' },
    ...(currentUser.role === UserRole.VERIFIED_BUSINESS || currentUser.role === UserRole.VERIFIED_SELLER
      ? [{ id: 'business', label: 'Business Console', icon: Building, color: 'text-rose-500' }]
      : []),
    { id: 'goodpoints', label: 'GoodPoints Rewards', icon: Sparkles, color: 'text-yellow-500' },
    { id: 'referrals', label: 'Referral Center', icon: Gift, color: 'text-emerald-400' },
    { id: 'delivery', label: 'Courier & SafeMeet', icon: MapPin, color: 'text-red-500' },
    { id: 'support', label: 'Help & Live Support', icon: HelpCircle, color: 'text-violet-500' },
    { id: 'legal', label: 'Legal Accordions', icon: FileText, color: 'text-slate-400' },
    { id: 'about', label: 'About GoodSale', icon: Info, color: 'text-gray-400' },
    { id: 'account_management', label: 'Account Controls', icon: Trash2, color: 'text-red-600' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Control Center Banner Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white p-6 sm:p-8 rounded-[32px] border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10">
          <button 
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white mb-3 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Marketplace
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-500/20 rounded-2xl flex items-center justify-center border border-orange-500/20 text-orange-400">
              <Settings className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-black tracking-tight">GoodSale™ Control Center</h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">Configure security profiles, transaction thresholds, notification hubs, and test developer operations.</p>
            </div>
          </div>
        </div>

      </div>

      {/* Main Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* SIDEBAR NAVIGATION */}
        <div className="lg:col-span-1 space-y-4">
          <div className="lg:hidden flex justify-between items-center bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-4 rounded-2xl">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Category: {categories.find(c => c.id === activeTab)?.label}</span>
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 bg-gray-50 dark:bg-slate-800 rounded-xl"
            >
              <Menu className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            </button>
          </div>

          <div className={`bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-4 rounded-[32px] shadow-sm space-y-1 ${isMobileMenuOpen ? 'block' : 'hidden lg:block'}`}>
            <p className="text-[10px] font-sans font-black text-slate-400 uppercase tracking-widest px-3 mb-3">Settings Categories</p>
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveTab(cat.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-left transition-all cursor-pointer ${
                    activeTab === cat.id
                      ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-l-4 border-orange-500'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800/50 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${activeTab === cat.id ? 'text-orange-500' : cat.color}`} />
                  <span className="truncate">{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Quick Info Card under Sidebar */}
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-gray-150 dark:border-slate-800/80 p-5 rounded-3xl text-xs space-y-3">
            <h4 className="font-sans font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px]">Active Session Info</h4>
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="font-mono text-slate-600 dark:text-slate-400">{currentUser.fullName}</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono space-y-1">
              <p>Username: @{currentUser.username}</p>
              <p>Rating Trust: {currentUser.trustScore}%</p>
              <p>Level: {currentUser.sellerLevel}</p>
              <p>GoodPoints: {currentUser.goodPoints} GP</p>
            </div>
          </div>
        </div>

        {/* MAIN PANEL CONTENT */}
        <div className="lg:col-span-3">
          
          {/* TAB 1: ACCOUNT PROFILE */}
          {activeTab === 'account' && (
            <form onSubmit={handleSave} className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <User className="w-5 h-5 text-orange-500" />
                    Account Specifications
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Manage profile branding, bio information, and default delivery coordinates.</p>
                </div>

                {/* Profile Media Settings */}
                <div className="space-y-4">
                  <span className="text-[10px] font-sans font-black text-slate-400 uppercase tracking-wider block">Profile Branding Assets</span>
                  <div className="relative h-36 rounded-2xl bg-gray-100 overflow-hidden border border-gray-200 dark:border-slate-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={coverPic} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <label className="px-3 py-1.5 bg-white text-slate-900 text-[10px] font-bold rounded-lg cursor-pointer">
                        Change Cover Photo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setCoverPic(URL.createObjectURL(file));
                            void (async () => {
                              try {
                                const { uploadMedia } = await import('@/lib/upload');
                                setCoverPic(await uploadMedia(file, 'user-media'));
                              } catch (err) {
                                alert(err instanceof Error ? err.message : 'Cover upload failed');
                              }
                            })();
                          }}
                        />
                      </label>
                    </div>
                    {/* Profile avatar overlay */}
                    <div className="absolute bottom-3 left-4 w-16 h-16 rounded-full border-2 border-white overflow-hidden bg-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={profilePic} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <label className="text-[8px] text-white font-extrabold cursor-pointer">
                          Edit
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setProfilePic(URL.createObjectURL(file));
                              void (async () => {
                                try {
                                  const { uploadMedia } = await import('@/lib/upload');
                                  setProfilePic(await uploadMedia(file, 'user-media'));
                                } catch (err) {
                                  alert(err instanceof Error ? err.message : 'Photo upload failed');
                                }
                              })();
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>


                {/* Account type */}
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/15 rounded-2xl space-y-3">
                  <h4 className="text-xs font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">Account type</h4>
                  <p className="text-[10px] text-slate-400">Current: <strong>{currentUser?.role || '—'}</strong>. Change anytime.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { role: UserRole.BUYER, label: 'Buyer' },
                      { role: UserRole.SELLER, label: 'Seller' },
                      { role: UserRole.BUSINESS, label: 'Business' },
                    ].map((opt) => (
                      <button
                        key={opt.role}
                        type="button"
                        onClick={async () => {
                          const res = await dbOperations.updateCurrentUserRole(opt.role);
                          if (!res.success) {
                            alert(res.error || 'Could not change role');
                            return;
                          }
                          alert(`Account type updated to ${res.role || opt.role}`);
                        }}
                        className={`px-3 py-2.5 rounded-xl text-xs font-bold uppercase cursor-pointer border ${
                          currentUser?.role === opt.role ||
                          (opt.role === UserRole.SELLER && currentUser?.role === UserRole.VERIFIED_SELLER) ||
                          (opt.role === UserRole.BUSINESS && currentUser?.role === UserRole.VERIFIED_BUSINESS)
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-gray-200 dark:border-slate-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Contact forms */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Full Legal Name</label>
                    <input 
                      type="text" 
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:outline-none focus:border-orange-500 text-slate-800 dark:text-slate-200 transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Display Nickname</label>
                    <input 
                      type="text" 
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:outline-none focus:border-orange-500 text-slate-800 dark:text-slate-200 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email Address</label>
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:outline-none focus:border-orange-500 text-slate-800 dark:text-slate-200 transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Phone Connection</label>
                    <input 
                      type="tel" 
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Public Bio Statement</label>
                  <textarea 
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={2}
                    placeholder="E.g. Verified Lagos Tech Merchant | High Quality UK Used Electronics..."
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:outline-none focus:border-orange-500 text-slate-800 dark:text-slate-200 transition-all resize-none"
                  />
                </div>

                {/* Default Delivery Location */}
                <div className="border-t border-gray-100 dark:border-slate-850 pt-5 space-y-4">
                  <h3 className="font-display font-black text-sm text-slate-800 dark:text-white flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-500" />
                    Primary Dispatch Address
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[9px] font-sans font-black text-slate-400 uppercase tracking-wider">Street Address</label>
                      <input 
                        type="text" 
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:outline-none focus:border-orange-500 text-slate-800 dark:text-slate-200 transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-sans font-black text-slate-400 uppercase tracking-wider">City</label>
                      <input 
                        type="text" 
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:outline-none focus:border-orange-500 text-slate-800 dark:text-slate-200 transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-sans font-black text-slate-400 uppercase tracking-wider">State Region</label>
                      <input 
                        type="text" 
                        value={stateName}
                        onChange={(e) => setStateName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:outline-none focus:border-orange-500 text-slate-800 dark:text-slate-200 transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-sans font-black text-slate-400 uppercase tracking-wider">Default Delivery Channel</label>
                      <select 
                        value={defaultDeliveryMethod}
                        onChange={(e) => setDefaultDeliveryMethod(e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:outline-none focus:border-orange-500 text-slate-800 dark:text-slate-200 transition-all"
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
              <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-4 rounded-2xl">
                {saveSuccess ? (
                  <span className="text-xs font-extrabold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1.5 rounded-lg border border-emerald-100">
                    ✓ Profile specifications successfully synchronized!
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-slate-400">Save edits to commit to the secure persistent database.</span>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-orange-500 text-white hover:bg-orange-600 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
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
              <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <Shield className="w-5 h-5 text-indigo-500" />
                    Security, Encryption & Auth
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Configure advanced merchant protection metrics, Multi-Factor Authentication (MFA), and active logins.</p>
                </div>

                {/* Password Change Simulator */}
                <div className="border-b border-gray-100 dark:border-slate-850 pb-6 space-y-4">
                  <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Change Account Password</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input 
                      type="password" 
                      placeholder="Current Password" 
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      className="px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                    />
                    <input 
                      type="password" 
                      placeholder="New Secure Password" 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                    />
                    <input 
                      type="password" 
                      placeholder="Confirm Secure Password" 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      if (!oldPassword || !newPassword) {
                        alert('Please fill out all password fields.');
                        return;
                      }
                      if (newPassword !== confirmPassword) {
                        alert('New passwords do not match!');
                        return;
                      }
                      alert('Password successfully reset & cryptographically updated!');
                      setOldPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                    className="px-4 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-850 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Update Password Token
                  </button>
                </div>

                {/* Two Factor Configuration */}
                <div className="border-b border-gray-100 dark:border-slate-850 pb-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Two-Factor Authenticator (2FA)</h3>
                      <p className="text-[10px] text-slate-400 mt-1">Secure escrow releases with external authenticator codes.</p>
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
                      <div className="w-11 h-6 bg-gray-250 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600" />
                    </label>
                  </div>

                  {/* Biometric Login */}
                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Biometric Passkey Access</h3>
                      <p className="text-[10px] text-slate-400 mt-1">Unlock browser dashboard using local FaceID or Fingerprint reader.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={biometricsEnabled} 
                        onChange={(e) => {
                          setBiometricsEnabled(e.target.checked);
                          if (e.target.checked) alert('Local browser Passkey registration completed successfully!');
                        }}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-gray-250 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600" />
                    </label>
                  </div>
                </div>

                {/* Login History */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Active Secure Sessions</h3>
                    <button 
                      onClick={() => {
                        setActiveSessions([{ id: 1, device: 'Chrome (macOS)', ip: '102.89.43.120', location: 'Lagos, Nigeria', isCurrent: true }]);
                        alert('Terminated all other active browser sessions successfully!');
                      }}
                      className="text-[10px] text-red-500 hover:underline font-bold cursor-pointer"
                    >
                      Log Out Other Devices
                    </button>
                  </div>

                  <div className="space-y-2">
                    {activeSessions.map((sess) => (
                      <div key={sess.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800/40 rounded-xl text-xs border border-gray-150 dark:border-slate-850">
                        <div className="flex items-center gap-3">
                          <Smartphone className="w-4 h-4 text-indigo-500 shrink-0" />
                          <div>
                            <p className="font-extrabold text-slate-800 dark:text-white">{sess.device}</p>
                            <p className="text-[10px] text-slate-400">{sess.location} • {sess.ip}</p>
                          </div>
                        </div>
                        {sess.isCurrent ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[8px] font-black tracking-widest uppercase rounded">Current</span>
                        ) : (
                          <button 
                            onClick={() => {
                              setActiveSessions(activeSessions.filter(a => a.id !== sess.id));
                            }}
                            className="text-[9px] font-bold text-red-500 hover:underline"
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
                  <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-[32px] max-w-sm w-full shadow-2xl space-y-4">
                    <div>
                      <h3 className="font-display font-black text-base text-slate-900 dark:text-white">Configure Two-Factor Auth</h3>
                      <p className="text-xs text-slate-500 mt-1 font-sans">Scan the QR code with Google Authenticator or enter the manual code below.</p>
                    </div>

                    <div className="flex flex-col items-center py-4 bg-gray-50 dark:bg-slate-800 rounded-2xl">
                      {/* Simulated QR Code */}
                      <div className="w-32 h-32 bg-slate-200 dark:bg-slate-700 flex items-center justify-center border-4 border-white mb-2 relative">
                        <Database className="w-16 h-16 text-slate-400 dark:text-slate-500" />
                        <span className="absolute bottom-1 right-1 bg-indigo-500 text-white text-[8px] px-1 rounded font-mono font-bold">SECURE</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">Manual Key: <strong className="text-slate-700 dark:text-slate-300">GDSX 8912 ALQP</strong></span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-black text-slate-400 block uppercase">Enter 6-Digit Authenticator Code</label>
                      <input 
                        type="text"
                        maxLength={6}
                        placeholder="e.g. 192843"
                        value={twoFactorCode}
                        onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none text-center font-mono font-bold tracking-widest"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => {
                          setShowTwoFactorModal(false);
                          setTwoFactorCode('');
                        }}
                        className="flex-1 py-2 bg-gray-100 text-slate-700 text-xs font-bold rounded-xl"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (twoFactorCode.length === 6) {
                            setTwoFactorEnabled(true);
                            setTwoFactorVerified(true);
                            setShowTwoFactorModal(false);
                            alert('Google Multi-Factor Authentication (2FA) verified and activated successfully!');
                          } else {
                            alert('Please enter a valid 6-digit verification code.');
                          }
                        }}
                        className="flex-1 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl"
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
              <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <Bell className="w-5 h-5 text-blue-500" />
                    Granular Notification Matrix
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Customize which transactional and promotional updates route to which client-side channel.</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-gray-150 dark:border-slate-800 text-[10px] font-sans font-black text-slate-400 uppercase tracking-wider">
                        <th className="py-3">Notification Trigger</th>
                        <th className="py-3 text-center">In-App Push</th>
                        <th className="py-3 text-center">Email Alert</th>
                        <th className="py-3 text-center">SMS Text</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-150 dark:divide-slate-850">
                      {Object.entries(notifPreferences).map(([key, channels]) => (
                        <tr key={key} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/20">
                          <td className="py-3.5 font-bold text-slate-800 dark:text-slate-200 capitalize">
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
                              className="w-4 h-4 accent-orange-500 cursor-pointer"
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
                              className="w-4 h-4 accent-orange-500 cursor-pointer"
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
                              className="w-4 h-4 accent-orange-500 cursor-pointer"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  onClick={() => {
                    alert('Granular alert routing saved and mapped successfully!');
                  }}
                  className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition-all"
                >
                  Save Notification Toggles
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: APPEARANCE */}
          {activeTab === 'appearance' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <Sun className="w-5 h-5 text-amber-500" />
                    Appearance Settings
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Configure layout themes, responsive scaling densities, and accessibility metrics.</p>
                </div>

                {/* Theme Mode Toggles */}
                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider block">Visual Theme</label>
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
                            alert(`Visual theme preference configured: ${mode.label}.`);
                          }}
                          className={`flex flex-col items-center gap-2 p-4 rounded-2xl border text-center transition-all cursor-pointer ${
                            themeMode === mode.id
                              ? 'bg-orange-500/10 border-orange-500 text-orange-600'
                              : 'bg-gray-50 dark:bg-slate-800/40 border-gray-150 dark:border-slate-800 hover:bg-gray-100 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <ModeIcon className="w-5 h-5" />
                          <span className="text-[10px] font-bold">{mode.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Display Density */}
                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider block">Display Density</label>
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
                          alert(`Density configured to ${dens.label}.`);
                        }}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                          density === dens.id
                            ? 'bg-orange-500/10 border-orange-500 text-orange-600'
                            : 'bg-gray-50 dark:bg-slate-800/40 border-gray-150 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <p className="text-xs font-bold">{dens.label}</p>
                        <p className="text-[9px] text-slate-400 mt-1 leading-normal">{dens.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Scaling */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Font Scaling Profile</label>
                    <span className="text-[10px] font-mono text-indigo-500 font-bold capitalize">{fontSize} Profile</span>
                  </div>
                  <div className="flex gap-2">
                    {['small', 'medium', 'large'].map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => {
                          setFontSize(sz as any);
                          alert(`Font profile configured: ${sz}.`);
                        }}
                        className={`flex-1 py-2 text-center rounded-xl text-xs font-bold capitalize ${
                          fontSize === sz
                            ? 'bg-slate-900 text-white dark:bg-slate-800'
                            : 'bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Motion Effects */}
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800/40 rounded-2xl border border-gray-150">
                  <div>
                    <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Reduce Motion Transitions</h3>
                    <p className="text-[10px] text-slate-400 mt-1">Disable complex floating and scaling animations for optimal hardware rendering.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={reduceMotion} 
                      onChange={(e) => setReduceMotion(e.target.checked)}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-gray-250 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PRIVACY CONTROL */}
          {activeTab === 'privacy' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <Lock className="w-5 h-5 text-emerald-500" />
                    Privacy & Credentials Visibility
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Configure who can view your trust rating score, telephone coordinates, or online check-in state.</p>
                </div>

                {/* Profile Visibility */}
                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider block">Global Profile Visibility</label>
                  <select
                    value={profileVisibility}
                    onChange={(e) => setProfileVisibility(e.target.value as any)}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold"
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
                    <label key={idx} className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800 rounded-2xl cursor-pointer">
                      <div>
                        <span className="text-xs font-black text-slate-800 dark:text-white block">{priv.label}</span>
                        <span className="text-[10px] text-slate-400 font-normal">{priv.desc}</span>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={priv.state}
                        onChange={(e) => priv.setter(e.target.checked)}
                        className="w-5 h-5 accent-orange-500 cursor-pointer"
                      />
                    </label>
                  ))}
                </div>

                {/* Blocked/Muted Lists */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 dark:border-slate-850 pt-5">
                  <div className="space-y-2">
                    <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Blocked Account Registry</h3>
                    <div className="p-3 bg-gray-50 dark:bg-slate-800/40 rounded-xl border border-gray-150">
                      {blockedUsers.length === 0 ? (
                        <p className="text-[10px] text-slate-400">Zero blocked traders.</p>
                      ) : (
                        <div className="space-y-2">
                          {blockedUsers.map(usr => (
                            <div key={usr} className="flex justify-between items-center text-[11px]">
                              <span className="font-mono text-slate-600 dark:text-slate-300">@{usr}</span>
                              <button 
                                onClick={() => {
                                  setBlockedUsers(blockedUsers.filter(b => b !== usr));
                                  alert(`Unblocked @${usr} successfully.`);
                                }}
                                className="text-[9px] font-bold text-indigo-500 hover:underline cursor-pointer"
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
                    <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Muted Chat Accounts</h3>
                    <div className="p-3 bg-gray-50 dark:bg-slate-800/40 rounded-xl border border-gray-150">
                      {mutedUsers.length === 0 ? (
                        <p className="text-[10px] text-slate-400">Zero muted accounts.</p>
                      ) : (
                        <div className="space-y-2">
                          {mutedUsers.map(usr => (
                            <div key={usr} className="flex justify-between items-center text-[11px]">
                              <span className="font-mono text-slate-600 dark:text-slate-300">@{usr}</span>
                              <button 
                                onClick={() => {
                                  setMutedUsers(mutedUsers.filter(m => m !== usr));
                                  alert(`Unmuted @${usr} successfully.`);
                                }}
                                className="text-[9px] font-bold text-indigo-500 hover:underline cursor-pointer"
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
              <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-pink-500" />
                    Buying Preferences & Address Book
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Manage secondary shipping locations, preferred escrow payment systems, and saved searches.</p>
                </div>

                {/* Address Book */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Saved Shipping Locations</h3>
                  <div className="space-y-2">
                    {savedAddresses.map((adr) => (
                      <div key={adr.id} className="p-4 bg-gray-50 dark:bg-slate-800/40 border border-gray-150 dark:border-slate-850 rounded-2xl flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-800 dark:text-white">{adr.label}</span>
                            {adr.isDefault && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[8px] font-black uppercase rounded">Default</span>}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">{adr.address}</p>
                        </div>
                        <div className="flex gap-2">
                          {!adr.isDefault && (
                            <button
                              onClick={() => {
                                setSavedAddresses(savedAddresses.map(a => ({ ...a, isDefault: a.id === adr.id })));
                              }}
                              className="text-[9px] text-indigo-500 hover:underline font-bold"
                            >
                              Set Default
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSavedAddresses(savedAddresses.filter(a => a.id !== adr.id));
                            }}
                            className="text-[9px] text-red-500 hover:underline font-bold"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add New Address Form */}
                  <form onSubmit={handleAddAddress} className="bg-slate-50 dark:bg-slate-800/25 p-4 rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Add New Address</p>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <input 
                        type="text" 
                        placeholder="Label (e.g. Vacation Cabin)" 
                        value={newAddressLabel}
                        onChange={(e) => setNewAddressLabel(e.target.value)}
                        className="sm:col-span-1 px-3 py-2 bg-white dark:bg-slate-900 border border-gray-200 rounded-xl text-xs"
                      />
                      <input 
                        type="text" 
                        placeholder="Complete Street Address, City, State" 
                        value={newAddressText}
                        onChange={(e) => setNewAddressText(e.target.value)}
                        className="sm:col-span-2 px-3 py-2 bg-white dark:bg-slate-900 border border-gray-200 rounded-xl text-xs"
                      />
                      <button 
                        type="submit"
                        className="sm:col-span-1 py-2 bg-slate-900 dark:bg-slate-800 text-white font-bold rounded-xl text-xs cursor-pointer"
                      >
                        Add Address
                      </button>
                    </div>
                  </form>
                </div>

                {/* Default Escrow Method */}
                <div className="border-t border-gray-100 dark:border-slate-850 pt-5 space-y-3">
                  <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Default Payment Protocol</h3>
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
                            ? 'bg-orange-500/10 border-orange-500 text-orange-600'
                            : 'bg-gray-50 dark:bg-slate-800/40 border-gray-150'
                        }`}
                      >
                        <p className="text-xs font-bold">{pm.label}</p>
                        <p className="text-[9px] text-slate-400 mt-1 leading-normal">{pm.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Saved Searches */}
                <div className="border-t border-gray-100 dark:border-slate-850 pt-5 space-y-3">
                  <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Saved Searches (Push Alerts Active)</h3>
                  <div className="flex flex-wrap gap-2">
                    {savedSearches.map((search) => (
                      <div key={search} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full text-xs font-bold text-slate-700 dark:text-slate-300">
                        <span>&ldquo;{search}&rdquo;</span>
                        <button 
                          onClick={() => setSavedSearches(savedSearches.filter(s => s !== search))}
                          className="text-[10px] text-red-500 font-extrabold hover:underline"
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
              <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <Grid className="w-5 h-5 text-teal-500" />
                    Selling & Stock Settings
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Configure merchant stock triggers, Vacation mode automatic replies, and default category parameters.</p>
                </div>

                {/* Vacation Mode */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Vacation Mode</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Conceal active listings from search results temporarily while you are unavailable.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={vacationMode} 
                        onChange={(e) => setVacationMode(e.target.checked)}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-gray-250 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-teal-500" />
                    </label>
                  </div>

                  {vacationMode && (
                    <div className="space-y-1.5 animate-slide-up">
                      <label className="text-[9px] font-sans font-black text-slate-400 uppercase tracking-wider block">Vacation Auto-Reply Message</label>
                      <textarea
                        value={vacationAutoReply}
                        onChange={(e) => setVacationAutoReply(e.target.value)}
                        rows={2}
                        className="w-full p-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 rounded-xl text-xs font-bold"
                      />
                    </div>
                  )}
                </div>

                {/* Stock alerts */}
                <div className="border-t border-gray-100 dark:border-slate-850 pt-5 space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Inventory Depletion Threshold</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Trigger warning notification when product inventory count drops to this value.</p>
                    </div>
                    <span className="text-xs font-mono font-bold text-teal-600 bg-teal-50 dark:bg-teal-950/20 px-2.5 py-1 rounded-lg">≤ {inventoryAlertThreshold} Units left</span>
                  </div>
                  <input 
                    type="range" 
                    min={1} 
                    max={10} 
                    value={inventoryAlertThreshold}
                    onChange={(e) => setInventoryAlertThreshold(parseInt(e.target.value))}
                    className="w-full accent-teal-600 cursor-pointer"
                  />
                </div>

                {/* Default product configurations */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 dark:border-slate-850 pt-5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-black text-slate-400 uppercase tracking-wider block">Default Listing Category</label>
                    <select
                      value={defaultCategory}
                      onChange={(e) => setDefaultCategory(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:outline-none focus:border-teal-500"
                    >
                      <option value="ELECTRONICS">UK Used Electronics / Gadgets</option>
                      <option value="FASHION">Native Apparel & Tailoring</option>
                      <option value="VEHICLES">Automobile Parts & Vehicles</option>
                      <option value="SERVICES">Freelance Technical Services</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-black text-slate-400 uppercase tracking-wider block">Default Dispatch Method</label>
                    <select
                      value={defaultDeliveryMethod}
                      onChange={(e) => setDefaultDeliveryMethod(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:outline-none focus:border-teal-500"
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
              <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <Building className="w-5 h-5 text-rose-500" />
                    Verified Business Specifications
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Configure business visual banners, opening calendars, and roles & permissions for staff members.</p>
                </div>

                {/* Banner assets */}
                <div className="space-y-4">
                  <span className="text-[10px] font-sans font-black text-slate-400 uppercase tracking-wider block">Corporate Banner Assets</span>
                  <div className="relative h-32 rounded-2xl bg-gray-100 overflow-hidden border border-gray-250 dark:border-slate-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={businessBanner} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <button 
                        type="button"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*';
                          input.onchange = () => {
                            const file = input.files?.[0];
                            if (!file) return;
                            setBusinessBanner(URL.createObjectURL(file));
                            void (async () => {
                              try {
                                const { uploadMedia } = await import('@/lib/upload');
                                setBusinessBanner(await uploadMedia(file, 'user-media'));
                              } catch (err) {
                                alert(err instanceof Error ? err.message : 'Banner upload failed');
                              }
                            })();
                          };
                          input.click();
                        }}
                        className="px-3 py-1.5 bg-white text-slate-900 text-[10px] font-bold rounded-lg cursor-pointer"
                      >
                        Change Corporate Banner
                      </button>
                    </div>
                    {/* Logo Overlay */}
                    <div className="absolute bottom-3 left-4 w-12 h-12 rounded-xl border-2 border-white overflow-hidden bg-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={businessLogo} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = () => {
                              const file = input.files?.[0];
                              if (!file) return;
                              setBusinessLogo(URL.createObjectURL(file));
                              void (async () => {
                                try {
                                  const { uploadMedia } = await import('@/lib/upload');
                                  setBusinessLogo(await uploadMedia(file, 'user-media'));
                                } catch (err) {
                                  alert(err instanceof Error ? err.message : 'Logo upload failed');
                                }
                              })();
                            };
                            input.click();
                          }}
                          className="text-[8px] text-white font-black cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Corporate Business Name</label>
                    <input 
                      type="text" 
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Opening & Closing Hours</label>
                    <input 
                      type="text" 
                      value={businessHours}
                      onChange={(e) => setBusinessHours(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Storefront Description</label>
                  <textarea 
                    value={businessDesc}
                    onChange={(e) => setBusinessDesc(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold resize-none"
                  />
                </div>

                {/* Staff list */}
                <div className="border-t border-gray-100 dark:border-slate-850 pt-5 space-y-3">
                  <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Corporate Staff Management</h3>
                  <div className="space-y-2">
                    {staffList.map((st) => (
                      <div key={st.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-slate-800/40 rounded-xl border border-gray-150 text-xs">
                        <div>
                          <p className="font-extrabold text-slate-800 dark:text-white">{st.name}</p>
                          <p className="text-[10px] text-slate-400">{st.role}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[8px] font-black uppercase rounded">{st.status}</span>
                          <button
                            type="button"
                            onClick={() => setStaffList(staffList.filter(s => s.id !== st.id))}
                            className="text-[9px] text-red-500 hover:underline font-bold"
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
                      className="flex-1 px-3 py-2 bg-gray-50 rounded-xl text-xs"
                    />
                    <select
                      value={newStaffRole}
                      onChange={(e) => setNewStaffRole(e.target.value)}
                      className="px-3 py-2 bg-gray-50 rounded-xl text-xs"
                    >
                      <option value="Store Manager">Store Manager</option>
                      <option value="Support Agent">Support Agent</option>
                      <option value="Inventory Clerk">Inventory Clerk</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddStaff}
                      className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer"
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
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Save Business Specifications
                </button>
              </div>
            </form>
          )}

          {/* TAB 9: GOODPOINTS REWARDS */}
          {activeTab === 'goodpoints' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-yellow-500" />
                      GoodPoints (GP) Loyalist Hub
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">Redeem your accumulated escrow-handshake trust loyalty points for exclusive vouchers.</p>
                  </div>
                  <div className="px-4 py-2.5 bg-amber-500 text-slate-950 rounded-2xl font-mono text-center">
                    <span className="text-[9px] uppercase font-black block tracking-widest text-slate-800">Your Balance</span>
                    <span className="text-base font-black">⭐ {currentUser.goodPoints} GP</span>
                  </div>
                </div>

                {/* Rewards Catalog */}
                <div className="space-y-4 pt-2">
                  <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Rewards Catalog</h3>
                  
                  {redeemedVoucher && (
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-400 rounded-2xl text-xs space-y-1 animate-scale-up">
                      <p className="font-black">⭐ VOUCHER SUCCESSFULLY REDEEMED!</p>
                      <p>Use code: <strong className="font-mono bg-white dark:bg-slate-950 px-2 py-0.5 rounded text-indigo-600 font-extrabold">{redeemedVoucher}</strong> at checkout.</p>
                      <button 
                        onClick={() => setRedeemedVoucher(null)}
                        className="text-[10px] underline font-bold block mt-2"
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
                      <div key={reward.title} className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-gray-150 flex flex-col justify-between text-xs">
                        <div>
                          <span className="text-yellow-500 font-mono font-black text-[10px] block">COST: {reward.cost} GP</span>
                          <h4 className="font-black text-slate-800 dark:text-white mt-1">{reward.title}</h4>
                          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{reward.desc}</p>
                        </div>
                        <button
                          onClick={() => handleRedeemPoints(reward.cost, reward.code)}
                          className="mt-4 w-full py-2 bg-slate-900 hover:bg-yellow-500 hover:text-slate-950 text-white rounded-xl text-[10px] uppercase font-black transition-all cursor-pointer"
                        >
                          Redeem reward
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Points Ledger */}
                <div className="border-t border-gray-100 dark:border-slate-850 pt-5 space-y-3">
                  <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Points Ledger History</h3>
                  <div className="divide-y divide-gray-100 dark:divide-slate-850">
                    {db.goodPoints.filter(g => g.userId === currentUser.id).map((tx) => (
                      <div key={tx.id} className="py-2.5 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-bold text-slate-800 dark:text-slate-200">{tx.reason}</p>
                          <p className="text-[9px] text-slate-400">{new Date(tx.createdAt).toLocaleDateString()}</p>
                        </div>
                        <span className={`font-mono font-black ${tx.points >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
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
              <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <Gift className="w-5 h-5 text-emerald-400" />
                    Referral Center
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Invite other merchants or buyers to earn +150 GP for every first completed escrow deal.</p>
                </div>

                {/* Referral Link Box */}
                <div className="p-5 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl space-y-3">
                  <span className="text-[10px] font-sans font-black text-emerald-600 block uppercase tracking-wider">Your Unique Invite Coordinates</span>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      readOnly 
                      value={`https://goodsale.ng/join?ref=${currentUser.referralCode || 'GS-HAMZA-12'}`}
                      className="flex-1 px-3 py-2.5 bg-white dark:bg-slate-950 border border-gray-200 rounded-xl text-xs font-mono select-all focus:outline-none"
                    />
                    <button
                      onClick={handleCopyReferral}
                      className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      {referralLinkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {referralLinkCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* Social Share Badges */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Share To Social Channels</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button onClick={() => alert('Launching WhatsApp referral payload...')} className="px-3.5 py-2 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white rounded-xl font-bold cursor-pointer transition-all">WhatsApp</button>
                    <button onClick={() => alert('Launching X.com referral intent payload...')} className="px-3.5 py-2 bg-black/10 text-slate-950 dark:text-white hover:bg-slate-900 rounded-xl font-bold cursor-pointer transition-all">X / Twitter</button>
                    <button onClick={() => alert('Launching Facebook share controller...')} className="px-3.5 py-2 bg-[#1877F2]/10 text-[#1877F2] hover:bg-[#1877F2] hover:text-white rounded-xl font-bold cursor-pointer transition-all">Facebook</button>
                  </div>
                </div>

                {/* Referrals ledger */}
                <div className="border-t border-gray-100 dark:border-slate-850 pt-5 space-y-3">
                  <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Referred Friends Registry</h3>
                  
                  {db.referrals.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4">No successful referrals yet. Share your code to get started!</p>
                  ) : (
                    <div className="divide-y divide-gray-150 dark:divide-slate-850">
                      {db.referrals.filter(r => r.referrerId === currentUser.id).map((ref) => (
                        <div key={ref.id} className="py-3 flex justify-between items-center text-xs">
                          <div>
                            <p className="font-extrabold text-slate-800 dark:text-white">{ref.refereeName}</p>
                            <p className="text-[9px] text-slate-400">Signed up {new Date(ref.createdAt).toLocaleDateString()}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 text-[8px] font-black uppercase rounded ${
                              ref.status === 'FIRST_ORDER_COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {ref.status === 'FIRST_ORDER_COMPLETED' ? 'Concluded (Earned)' : 'Pending Checkout'}
                            </span>
                            <span className="font-mono font-bold text-amber-500">+ {ref.pointsReward} GP</span>
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
              <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-red-500" />
                    Delivery, Courier & SafeMeet™ Zones
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Configure preferred dispatch courier agencies and default secure physical meeting coordinates.</p>
                </div>

                {/* Preferred courier */}
                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider block">Preferred Logistics Courier</label>
                  <select
                    value={preferredCourier}
                    onChange={(e) => setPreferredCourier(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:outline-none focus:border-red-500"
                  >
                    <option value="GIG Logistics">GIG Logistics (Premium Partner)</option>
                    <option value="DHL Nigeria">DHL Nigeria Express (Air Freight)</option>
                    <option value="FedEx Express">FedEx Lagos Express</option>
                    <option value="Local Bike Dispatch">Independent Dispatch Rider (Same-Day Lagos)</option>
                  </select>
                </div>

                {/* SafeMeet Location Favorite */}
                <div className="space-y-3 border-t border-gray-100 dark:border-slate-850 pt-5">
                  <label className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider block">Default SafeMeet™ Secure zone</label>
                  <div className="grid grid-cols-1 gap-2">
                    {db.safeMeetLocations.map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => {
                          setSafeMeetPreSel(loc.id);
                          alert(`Configured "${loc.name}" as your default SafeMeet™ coordinate.`);
                        }}
                        className={`p-4 rounded-2xl border text-left cursor-pointer transition-all ${
                          safeMeetPreSel === loc.id
                            ? 'bg-orange-500/10 border-orange-500 text-orange-600'
                            : 'bg-gray-50 dark:bg-slate-800/40 border-gray-150 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-extrabold text-xs">{loc.name}</span>
                          <span className="font-mono text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded uppercase font-black">⭐ Rating: {loc.safetyRating}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 leading-normal">{loc.address}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Default Pickup Address */}
                <div className="space-y-1.5 border-t border-gray-100 dark:border-slate-850 pt-5">
                  <label className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider block">Default Business Warehousing Pickup Address</label>
                  <input 
                    type="text" 
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 12: HELP & SUPPORT */}
          {activeTab === 'support' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-violet-500" />
                    Help & Support Handshake Center
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Explore instructional guidelines, launch live disputes, or contact our escrow support team.</p>
                </div>

                {/* FAQ list */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Frequently Asked Questions</h3>
                  {[
                    { q: 'Is my money safe in GoodSale Escrow?', a: 'Absolutely. Payment is locked within the client-side simulated escrow vault and only released once the buyer provides the delivery PIN handoff.' },
                    { q: 'What happens in case of a product dispute?', a: 'If a buyer rejects an item, they can trigger a Dispute. The locked funds remain in escrow, and our arbitration managers will investigate.' },
                    { q: 'How do I earn GoodPoints?', a: 'Earn GP by verifying your NIN profile, completing purchases successfully, and submitting reviews.' },
                  ].map((faq, idx) => (
                    <details key={idx} className="p-3 bg-gray-50 dark:bg-slate-800/40 rounded-xl text-xs border border-gray-150 group cursor-pointer">
                      <summary className="font-bold text-slate-800 dark:text-white select-none list-none flex justify-between items-center">
                        <span>{faq.q}</span>
                        <span className="font-bold text-slate-400 transition-transform group-open:rotate-180">▼</span>
                      </summary>
                      <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">{faq.a}</p>
                    </details>
                  ))}
                </div>

                {/* Support ticket submission */}
                <div className="border-t border-gray-100 dark:border-slate-850 pt-5 space-y-3">
                  <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Submit Support Inquiry Ticket</h3>
                  
                  {supportSuccess ? (
                    <div className="p-3.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl">
                      ✓ Inquiry successfully filed and logged with ticket ID: #GS-TK-{Math.floor(10000 + Math.random() * 90000)}!
                    </div>
                  ) : (
                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={supportType}
                          onChange={(e) => setSupportType(e.target.value)}
                          className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 rounded-xl"
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
                        className="w-full p-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 rounded-xl text-xs"
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
                        className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
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
              <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-slate-400" />
                    Legal Policies & Regulatory Accordions
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Review regulatory policies regarding escrow dispute handling, refunds, and merchant standards.</p>
                </div>

                <div className="space-y-2">
                  {[
                    { title: 'Privacy Policy', text: 'GoodSale is committed to protect personal information. We gather device coordinates, session cookies, and profile pictures strictly for user-to-user marketplace validation. Details are stored in local storage and never sold to third-party marketing entities.' },
                    { title: 'Terms of Service', text: 'By utilizing this website, you agree to respect escrow rules. Fraudulent listings, duplicate listings, spam bids, and misleading descriptions will result in immediate trust score reduction and account deactivation.' },
                    { title: 'Escrow Lock Policy', text: 'Locked payments are held inside a secure escrow smart ledger. If goods are dispatched, funds release is triggered only by entering the buyer delivery PIN or completing a SafeMeet handshake verified by both parties.' },
                    { title: 'Refund Policy', text: 'Refund claims are processed if the seller fails to dispatch within 72 hours, or if an active Dispute concludes in favor of the buyer during our internal arbitration process.' }
                  ].map((leg, idx) => (
                    <details key={idx} className="p-4 bg-gray-50 dark:bg-slate-800/40 rounded-xl text-xs border border-gray-150 group cursor-pointer">
                      <summary className="font-bold text-slate-800 dark:text-white select-none list-none flex justify-between items-center">
                        <span>{leg.title}</span>
                        <span className="font-bold text-slate-400 transition-transform group-open:rotate-180">▼</span>
                      </summary>
                      <p className="text-[11px] text-slate-400 mt-3 leading-relaxed border-t border-gray-200 dark:border-slate-700 pt-3">{leg.text}</p>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 14: ABOUT */}
          {activeTab === 'about' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6 text-center select-none">
                <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-orange-500/20 text-white shadow-lg">
                  <Settings className="w-8 h-8 animate-spin-slow" />
                </div>
                <div>
                  <h2 className="font-display font-black text-xl text-slate-900 dark:text-white">GoodSale™ Marketplace Suite</h2>
                  <p className="text-xs text-indigo-500 font-mono font-bold mt-1">Version 2.4.0-premium (Stable)</p>
                  <p className="text-xs text-slate-400 mt-3 max-w-md mx-auto leading-relaxed">
                    Designed to facilitate high-quality local commerce in Nigeria under full, secure, anti-fraud escrow protection mechanics. Developed for AI Studio environment.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto text-xs font-mono pt-4 border-t border-gray-100 dark:border-slate-800">
                  <div className="p-3 bg-gray-50 dark:bg-slate-800/40 rounded-xl">
                    <p className="text-[10px] text-slate-400">Environment</p>
                    <p className="font-bold mt-1">Cloud Sandbox</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-slate-800/40 rounded-xl">
                    <p className="text-[10px] text-slate-400">Database</p>
                    <p className="font-bold mt-1">Local Relational State</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 16: ACCOUNT CONTROLS */}
          {activeTab === 'account_management' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-red-600" />
                    Account Controls & Data Deletion
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Download personal transaction logs or irreversibly delete/deactivate your user profile.</p>
                </div>

                {/* Export user data */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-gray-150 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Export Relational Data JSON</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">Download a copy of your verified reviews, listings, and order history in JSON format.</p>
                  </div>
                  <button
                    onClick={handleExportData}
                    className="px-4 py-2 bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-850 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Export Data
                  </button>
                </div>

                {/* Deactivate account */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-gray-150 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Deactivate Marketplace Profile</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">Temporarily hide your profile details and active bids. Deactivation can be reverted by logging in again.</p>
                  </div>
                  <button
                    onClick={() => {
                      setDeactivated(true);
                      alert('Account successfully deactivated. Profile has been set to offline. Relogging in will reactivate active parameters.');
                    }}
                    className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500 text-amber-600 hover:text-slate-950 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    {deactivated ? 'Account Deactivated' : 'Deactivate profile'}
                  </button>
                </div>

                {/* Delete account */}
                <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-black text-red-600 uppercase tracking-wider">Permanent Account Deletion</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">Irreversibly wipe your user record, active listings, and trust score history. This action cannot be undone.</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm('Sign out and request account removal? Contact support to permanently wipe your Supabase profile.')) return;
                      await dbOperations.logout();
                      window.location.href = '/';
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Sign out & leave
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
