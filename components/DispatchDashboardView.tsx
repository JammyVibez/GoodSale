// components/DispatchDashboardView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  Truck, Shield, MapPin, Navigation, Compass, AlertCircle, CheckCircle2, 
  DollarSign, Clock, List, FileText, UserCheck, Plus, Check, Map, Eye,
  RefreshCw, TrendingUp, Key, Lock, Phone, User, Star, ChevronRight
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  getDBState, saveDBState, dbOperations, DeliveryPartner, DeliveryJob, DeliveryJobStatus, OrderStatus, UserRole, DeliveryVehicleType
} from '../lib/store';

export default function DispatchDashboardView() {
  const [db, setDb] = useState(getDBState());
  const [activeSubTab, setActiveSubTab] = useState<'onboarding' | 'marketplace' | 'active_jobs' | 'earnings'>('onboarding');
  
  // Registration Form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [vehicleType, setVehicleType] = useState<DeliveryVehicleType>(DeliveryVehicleType.MOTORCYCLE);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [color, setColor] = useState('');
  const [year, setYear] = useState('2024');
  const [capacity, setCapacity] = useState('50kg standard delivery box');
  const [address, setAddress] = useState('');
  const [stateName, setStateName] = useState('Lagos');
  const [cityName, setCityName] = useState('Ikeja');
  const [nin, setNin] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [photoUrl, setPhotoUrl] = useState('https://picsum.photos/seed/courier_driver/200');
  const [licenseUrl, setLicenseUrl] = useState('https://picsum.photos/seed/driver_license/200');
  const [selfieUrl, setSelfieUrl] = useState('https://picsum.photos/seed/courier_selfie/200');
  
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

  // Active tracking state
  const [simulatedJob, setSimulatedJob] = useState<DeliveryJob | null>(null);
  const [simulationActive, setSimulationActive] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState(false);

  // Tracking details
  const [mapLat, setMapLat] = useState(6.5244);
  const [mapLng, setMapLng] = useState(3.3792);
  const [simSpeed, setSimSpeed] = useState(0);
  const [simEta, setSimEta] = useState(25);

  // GoodDispatch Safety & SOS states
  const [sosActive, setSosActive] = useState(false);
  const [sosSuccessMessage, setSosSuccessMessage] = useState<string | null>(null);
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentType, setIncidentType] = useState('VEHICLE_BREAKDOWN');
  const [incidentNote, setIncidentNote] = useState('');
  const [incidentReported, setIncidentReported] = useState(false);

  useEffect(() => {
    const handleStateChange = () => {
      setDb(getDBState());
    };
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  const user = db.currentUser;
  const courier = db.deliveryPartners.find(p => p.userId === user?.id);

  // Handle active sub tab defaults based on approval status
  useEffect(() => {
    if (courier) {
      if (courier.status === 'APPROVED') {
        const activeJob = db.deliveryJobs.find(j => j.partnerId === courier.id && j.status !== DeliveryJobStatus.COMPLETED);
        if (activeJob) {
          setActiveSubTab('active_jobs');
          setSimulatedJob(activeJob);
        } else {
          setActiveSubTab('marketplace');
        }
      } else {
        setActiveSubTab('onboarding');
      }
    } else {
      setActiveSubTab('onboarding');
    }
  }, [courier]);

  // Handle Courier Registration Onboarding
  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setFormError('Please log in first to apply as a Delivery Partner.');
      return;
    }

    if (!fullName || !phone || !email || !brand || !model || !plateNumber || !nin || !licenseNumber) {
      setFormError('Please fill in all required fields, including vehicle registration documents.');
      return;
    }

    setFormError(null);
    try {
      const partner = dbOperations.registerDeliveryPartner({
        userId: user.id,
        fullName,
        phone,
        email,
        vehicleType,
        brand,
        model,
        plateNumber,
        color,
        year: parseInt(year) || 2024,
        capacity,
        address,
        state: stateName,
        city: cityName,
        nin,
        licenseNumber,
        photoUrl,
        selfieUrl,
        licenseUrl
      });

      if (partner) {
        setFormSuccess(true);
        dbOperations.addAuditLog(user.id, 'REGISTER_DELIVERY_PARTNER', 'deliveryPartners', partner.id, `Submitted courier driver application as ${vehicleType}`);
      }
    } catch (err: any) {
      setFormError(err.message || 'An error occurred during onboarding registration.');
    }
  };

  // Toggle Driver Active Availability Status
  const toggleAvailability = () => {
    if (!user || !courier) return;
    dbOperations.togglePartnerAvailability(user.id, !courier.isAvailable);
  };

  // Claim/Accept Delivery Job from Marketplace list
  const claimJob = (jobId: number) => {
    if (!courier) return;
    if (courier.status !== 'APPROVED') {
      alert('Only approved dispatch riders can accept delivery jobs.');
      return;
    }
    const updatedJob = dbOperations.acceptDeliveryJob(jobId, courier.id);
    if (updatedJob) {
      setSimulatedJob(updatedJob);
      setActiveSubTab('active_jobs');
      dbOperations.addAuditLog(user?.id || 0, 'ACCEPT_DELIVERY_JOB', 'deliveryJobs', jobId, `Courier Dele Coker accepted delivery request`);
    }
  };

  // Simulated GPS route progress updater
  useEffect(() => {
    let interval: any = null;
    if (simulationActive && simulatedJob) {
      let progressStep = 0;
      interval = setInterval(() => {
        progressStep += 1;
        // Lagos state target movement coordinates simulation (moving from Seller to Buyer location)
        // Starts at Ikeja (6.59), moves towards Victoria Island (6.42)
        const currentLat = 6.5920 - (progressStep * 0.015);
        const currentLng = 3.3540 + (progressStep * 0.012);
        const speed = Math.round(35 + Math.random() * 25); // Speed between 35-60 km/h
        const eta = Math.max(0, 25 - progressStep * 2);

        setMapLat(currentLat);
        setMapLng(currentLng);
        setSimSpeed(speed);
        setSimEta(eta);

        // Update central state so customers see real-time updates too!
        dbOperations.updateDeliveryJobStatus(simulatedJob.id, DeliveryJobStatus.IN_TRANSIT, {
          lat: currentLat,
          lng: currentLng,
          speed
        });

        if (progressStep >= 12) {
          // Arrived at destination
          setSimulationActive(false);
          setSimSpeed(0);
          setSimEta(0);
          dbOperations.updateDeliveryJobStatus(simulatedJob.id, DeliveryJobStatus.ARRIVED);
          clearInterval(interval);
        }
      }, 4000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [simulationActive, simulatedJob]);

  // Transition Active Job status
  const transitionJobStatus = (status: DeliveryJobStatus) => {
    if (!simulatedJob) return;
    
    if (status === DeliveryJobStatus.PICKED_UP) {
      dbOperations.updateDeliveryJobStatus(simulatedJob.id, DeliveryJobStatus.PICKED_UP);
    } else if (status === DeliveryJobStatus.IN_TRANSIT) {
      setSimulationActive(true);
      dbOperations.updateDeliveryJobStatus(simulatedJob.id, DeliveryJobStatus.IN_TRANSIT);
    }
  };

  // PIN code delivery completion handler
  const handleVerifyPin = () => {
    if (!simulatedJob) return;
    if (!pinCode) {
      setPinError('Please enter the 4-digit security delivery PIN.');
      return;
    }

    setPinError(null);
    setPinSuccess(false);

    const result = dbOperations.completeDeliveryJobWithPin(simulatedJob.id, pinCode);
    if (result.success) {
      setPinSuccess(true);
      setSimulatedJob(null);
      setPinCode('');
      // Show success screen or tab redirect
      setTimeout(() => {
        setPinSuccess(false);
        setActiveSubTab('earnings');
      }, 3000);
    } else {
      setPinError(result.message || 'Incorrect PIN code. Delivery completion failed.');
    }
  };

  // SOS emergency trigger
  const handleTriggerSos = () => {
    if (!simulatedJob) return;
    const state = getDBState();
    const job = state.deliveryJobs.find(j => j.id === simulatedJob.id);
    if (job) {
      job.trackingHistory.push({
        status: DeliveryJobStatus.IN_TRANSIT,
        time: new Date().toISOString(),
        note: `⚠️ SOS EMERGENCY TRIGGERED: Courier reported active safety/security alert. Real-time rescue coordinates: ${mapLat.toFixed(4)}° N, ${mapLng.toFixed(4)}° E. Urgent support dispatched.`
      });
      saveDBState(state);
      setDb(state);
      setSosActive(true);
      setSosSuccessMessage('🚨 Emergency SOS alert sent! GoodDispatch™ Operations and emergency medical/security partners have been notified with your live coordinates.');
      dbOperations.addAuditLog(user?.id || 0, 'SOS_ALERT', 'deliveryJobs', simulatedJob.id, `Courier Dele Coker triggered SOS emergency panic signal`);
      setTimeout(() => setSosSuccessMessage(null), 8000);
    }
  };

  // Report transit incident
  const handleReportIncident = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulatedJob || !incidentNote.trim()) return;
    const state = getDBState();
    const job = state.deliveryJobs.find(j => j.id === simulatedJob.id);
    if (job) {
      const typeLabel = incidentType.replace('_', ' ');
      job.trackingHistory.push({
        status: DeliveryJobStatus.IN_TRANSIT,
        time: new Date().toISOString(),
        note: `⚠️ DISPATCH INCIDENT [${typeLabel}]: ${incidentNote}`
      });
      saveDBState(state);
      setDb(state);
      setIncidentReported(true);
      setIncidentNote('');
      dbOperations.addAuditLog(user?.id || 0, 'INCIDENT_REPORTED', 'deliveryJobs', simulatedJob.id, `Courier Dele Coker logged transit incident: ${typeLabel}`);
      setTimeout(() => {
        setIncidentReported(false);
        setShowIncidentForm(false);
      }, 4000);
    }
  };

  // Get matching delivery jobs in courier's state/city
  const availableJobs = db.deliveryJobs.filter(j => {
    if (j.status !== DeliveryJobStatus.PENDING) return false;
    // Show all or match to same city/state
    return true;
  });

  const activeJob = db.deliveryJobs.find(j => j.partnerId === courier?.id && j.status !== DeliveryJobStatus.COMPLETED);
  const myCompletedJobs = db.deliveryJobs.filter(j => j.partnerId === courier?.id && j.status === DeliveryJobStatus.COMPLETED);
  const courierEarningsSum = myCompletedJobs.reduce((acc, j) => acc + j.courierEarnings, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 font-sans" id="gooddispatch-dashboard">
      
      {/* Top Banner with visual brand identity */}
      <div className="bg-gradient-to-r from-emerald-600 via-emerald-800 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden mb-8">
        <div className="absolute right-0 top-0 opacity-10 transform translate-x-12 -translate-y-12">
          <Truck className="w-96 h-96" />
        </div>
        <div className="relative z-10 space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/30 px-3 py-1 rounded-full text-xs font-semibold tracking-wide text-emerald-300">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            GoodDispatch™ Smart Logistics
          </div>
          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight">
            Logistics Dashboard
          </h1>
          <p className="text-xs md:text-sm text-emerald-100 font-medium">
            Register as an elite logistics partner. Deliver verified escrow orders across Nigeria with real-time GPS tracking and instant secure wallet payouts.
          </p>
        </div>
      </div>

      {!user ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl shadow-md p-8">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4 animate-pulse" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">Authentication Required</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-2">
            Please log in or register your account to access GoodDispatch™ Delivery Partner network on GoodSale.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Side Menu & Quick Profile Status */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
              
              {/* Profile Card */}
              <div className="flex items-center gap-3">
                <img 
                  src={courier?.photoUrl || db.profiles.find(p => p.userId === user.id)?.photoUrl || "https://picsum.photos/seed/driver_default/200"} 
                  alt="Courier Profile" 
                  className="w-12 h-12 rounded-full object-cover border-2 border-emerald-500 shadow-sm"
                />
                <div>
                  <h4 className="text-sm font-extrabold text-slate-800 dark:text-white truncate max-w-[150px]">
                    {courier?.fullName || user.fullName}
                  </h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                    ID: GS-COURIER-{(courier?.id || 100).toString().padStart(4, '0')}
                  </p>
                </div>
              </div>

              {/* Verified Badge/State */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 space-y-1.5 text-center">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Courier Application Status</span>
                <div>
                  {courier ? (
                    courier.status === 'APPROVED' ? (
                      <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs px-3 py-1 rounded-full font-black">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        Approved Rider
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs px-3 py-1 rounded-full font-black animate-pulse">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        Under Review
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-gray-100 dark:bg-slate-850 text-gray-500 dark:text-slate-400 text-xs px-3 py-1 rounded-full font-bold">
                      Not Registered
                    </span>
                  )}
                </div>
              </div>

              {/* Status Toggle Switch (Only for approved couriers) */}
              {courier && courier.status === 'APPROVED' && (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100/30">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 block">Duty Status</span>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">
                      {courier.isAvailable ? '🟢 ACTIVE / ONLINE' : '🔴 OFFLINE'}
                    </span>
                  </div>
                  <button 
                    onClick={toggleAvailability}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${courier.isAvailable ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-800'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${courier.isAvailable ? 'left-5.5' : 'left-0.5'}`} />
                  </button>
                </div>
              )}

              {/* Navigation Menu Links */}
              <div className="space-y-1.5 pt-4 border-t border-gray-100 dark:border-slate-800">
                {!courier && (
                  <button
                    onClick={() => setActiveSubTab('onboarding')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                      activeSubTab === 'onboarding' 
                        ? 'bg-emerald-500 text-white shadow-sm' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850'
                    }`}
                  >
                    <UserCheck className="w-4 h-4" />
                    Courier Onboarding
                  </button>
                )}
                {courier && courier.status !== 'APPROVED' && (
                  <button
                    onClick={() => setActiveSubTab('onboarding')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                      activeSubTab === 'onboarding' 
                        ? 'bg-emerald-500 text-white shadow-sm' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850'
                    }`}
                  >
                    <Eye className="w-4 h-4" />
                    Review Details
                  </button>
                )}
                {courier && courier.status === 'APPROVED' && (
                  <>
                    <button
                      onClick={() => setActiveSubTab('marketplace')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                        activeSubTab === 'marketplace' 
                          ? 'bg-emerald-500 text-white shadow-sm' 
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <List className="w-4 h-4" />
                        Delivery Marketplace
                      </span>
                      {availableJobs.length > 0 && (
                        <span className="bg-red-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">
                          {availableJobs.length}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => setActiveSubTab('active_jobs')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                        activeSubTab === 'active_jobs' 
                          ? 'bg-emerald-500 text-white shadow-sm' 
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Navigation className="w-4 h-4" />
                        Active Job Tracker
                      </span>
                      {activeJob && (
                        <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-ping" />
                      )}
                    </button>

                    <button
                      onClick={() => setActiveSubTab('earnings')}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                        activeSubTab === 'earnings' 
                          ? 'bg-emerald-500 text-white shadow-sm' 
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850'
                      }`}
                    >
                      <DollarSign className="w-4 h-4" />
                      Courier Earnings
                    </button>
                  </>
                )}
              </div>

            </div>
          </div>

          {/* Main SubTab Content Container */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm min-h-[500px]">
              
              {/* ONBOARDING SUB-TAB */}
              {activeSubTab === 'onboarding' && (
                <div className="space-y-6">
                  {courier ? (
                    <div className="space-y-6 text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4 animate-bounce">
                        <Clock className="w-8 h-8 text-amber-500" />
                      </div>
                      <h3 className="text-xl font-extrabold text-slate-850 dark:text-white">Application Under Review</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                        Thank you, <span className="font-extrabold text-slate-800 dark:text-slate-200">{courier.fullName}</span>! Your courier profile and vehicle registration credentials for vehicle plate <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-bold text-slate-850 dark:text-white">{courier.plateNumber}</span> are currently being reviewed by GoodSale Administrators.
                      </p>
                      
                      {/* Driver submitted specs summary */}
                      <div className="max-w-md mx-auto bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 text-left space-y-2">
                        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider font-mono">Submitted Credentials</h4>
                        <div className="grid grid-cols-2 gap-3 text-[11px] text-slate-600 dark:text-slate-400 font-sans">
                          <div><span className="text-slate-400 font-semibold block">Vehicle Type:</span> {courier.vehicleType}</div>
                          <div><span className="text-slate-400 font-semibold block">Plate Number:</span> {courier.plateNumber}</div>
                          <div><span className="text-slate-400 font-semibold block">Vehicle Brand:</span> {courier.brand} {courier.model}</div>
                          <div><span className="text-slate-400 font-semibold block">NIN ID Number:</span> {courier.nin.slice(0, 4)}*******</div>
                        </div>
                      </div>

                      <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl max-w-sm mx-auto text-xs text-indigo-500 font-medium">
                        ⏳ Estimated approval time: Less than 24 hours.
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleRegister} className="space-y-6">
                      
                      <div className="space-y-1">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white">Delivery Partner Onboarding</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Submit your vehicle specs, license, and national identity ID details to register as a Verified GoodDispatch™ rider.
                        </p>
                      </div>

                      {formError && (
                        <div className="p-4 bg-red-500/10 text-red-500 text-xs rounded-2xl border border-red-500/20 font-medium flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>{formError}</span>
                        </div>
                      )}

                      {formSuccess && (
                        <div className="p-4 bg-emerald-500/10 text-emerald-500 text-xs rounded-2xl border border-emerald-500/20 font-medium flex items-center gap-2">
                          <Check className="w-4 h-4 flex-shrink-0" />
                          <span>Onboarding application submitted successfully! Administrators will review your vehicle specs shortly.</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* 1. PERSONAL INFORMATION */}
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-emerald-600 dark:text-emerald-400">1. Personal Credentials</h4>
                          
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Full Name (Legal Name)</label>
                            <input 
                              type="text"
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              placeholder="e.g. Dele Coker"
                              className="w-full text-xs px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 focus:outline-none focus:border-emerald-500 text-slate-850 dark:text-white font-medium"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Phone Number (Active)</label>
                            <input 
                              type="text"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              placeholder="e.g. 08123456789"
                              className="w-full text-xs px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 focus:outline-none focus:border-emerald-500 text-slate-850 dark:text-white font-medium"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Email Address</label>
                            <input 
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="e.g. dele.coker@gmail.com"
                              className="w-full text-xs px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 focus:outline-none focus:border-emerald-500 text-slate-850 dark:text-white font-medium"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">State of Residence</label>
                              <input 
                                type="text"
                                value={stateName}
                                onChange={(e) => setStateName(e.target.value)}
                                className="w-full text-xs px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 text-slate-850 dark:text-white font-medium"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">City</label>
                              <input 
                                type="text"
                                value={cityName}
                                onChange={(e) => setCityName(e.target.value)}
                                className="w-full text-xs px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 text-slate-850 dark:text-white font-medium"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Address</label>
                            <input 
                              type="text"
                              value={address}
                              onChange={(e) => setAddress(e.target.value)}
                              placeholder="e.g. 22 Allen Avenue"
                              className="w-full text-xs px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 text-slate-850 dark:text-white font-medium"
                            />
                          </div>

                        </div>

                        {/* 2. VEHICLE SPECIFICATIONS */}
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-emerald-600 dark:text-emerald-400">2. Fleet Specs & Verification ID</h4>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Vehicle Type</label>
                              <select 
                                value={vehicleType}
                                onChange={(e) => setVehicleType(e.target.value as any)}
                                className="w-full text-xs px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 text-slate-850 dark:text-white font-semibold cursor-pointer"
                              >
                                <option value="BICYCLE">Bicycle</option>
                                <option value="MOTORCYCLE">Motorcycle</option>
                                <option value="KEKE">Keke (Tricycle)</option>
                                <option value="CAR">Car</option>
                                <option value="VAN">Van</option>
                                <option value="TRUCK">Truck</option>
                                <option value="LOGISTICS">Logistics Company</option>
                                <option value="FLEET">Fleet Owner</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Plate Number</label>
                              <input 
                                type="text"
                                value={plateNumber}
                                onChange={(e) => setPlateNumber(e.target.value)}
                                placeholder="e.g. LSR-432-AB"
                                className="w-full text-xs px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 text-slate-850 dark:text-white font-mono"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Vehicle Brand</label>
                              <input 
                                type="text"
                                value={brand}
                                onChange={(e) => setBrand(e.target.value)}
                                placeholder="e.g. Suzuki / TVS"
                                className="w-full text-xs px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 text-slate-850 dark:text-white font-medium"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Vehicle Model</label>
                              <input 
                                type="text"
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                placeholder="e.g. GR150 / Neo"
                                className="w-full text-xs px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 text-slate-850 dark:text-white font-medium"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Vehicle Color</label>
                              <input 
                                type="text"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                placeholder="e.g. Red"
                                className="w-full text-xs px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 text-slate-850 dark:text-white font-medium"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Capacity Box</label>
                              <input 
                                type="text"
                                value={capacity}
                                onChange={(e) => setCapacity(e.target.value)}
                                className="w-full text-xs px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 text-slate-850 dark:text-white font-medium"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">NIN Card Number</label>
                              <input 
                                type="text"
                                value={nin}
                                onChange={(e) => setNin(e.target.value)}
                                placeholder="11 digit NIN"
                                maxLength={11}
                                className="w-full text-xs px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 text-slate-850 dark:text-white font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Driver License ID</label>
                              <input 
                                type="text"
                                value={licenseNumber}
                                onChange={(e) => setLicenseNumber(e.target.value)}
                                placeholder="e.g. DL-29381-XYZ"
                                className="w-full text-xs px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 text-slate-850 dark:text-white font-mono"
                              />
                            </div>
                          </div>

                        </div>

                      </div>

                      {/* Mock File Upload Sections (Highly visual with placeholders) */}
                      <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-slate-800">
                        <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-500">3. Document Upload Check</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          
                          {/* Photo Selfie */}
                          <div className="border border-dashed border-gray-200 dark:border-slate-800 rounded-2xl p-4 text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-950/40 transition-colors">
                            <span className="text-2xl block mb-1">📸</span>
                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 block">Selfie with Vehicle</span>
                            <p className="text-[9px] text-slate-400 mt-1">Uploaded self_photo.png</p>
                          </div>

                          {/* Drivers License */}
                          <div className="border border-dashed border-gray-200 dark:border-slate-800 rounded-2xl p-4 text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-950/40 transition-colors">
                            <span className="text-2xl block mb-1">💳</span>
                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 block">Driver&apos;s License Photo</span>
                            <p className="text-[9px] text-slate-400 mt-1">Uploaded license_front.png</p>
                          </div>

                          {/* Vehicle Photo */}
                          <div className="border border-dashed border-gray-200 dark:border-slate-800 rounded-2xl p-4 text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-950/40 transition-colors">
                            <span className="text-2xl block mb-1">🏍️</span>
                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 block">Vehicle Box Photo</span>
                            <p className="text-[9px] text-slate-400 mt-1">Uploaded dispatch_bike.png</p>
                          </div>

                        </div>
                      </div>

                      {/* Onboarding submit button */}
                      <div className="flex justify-end pt-4">
                        <button
                          type="submit"
                          className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-sans font-bold text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 transition-transform active:scale-95"
                        >
                          <Truck className="w-4 h-4" />
                          Submit Onboarding Application
                        </button>
                      </div>

                    </form>
                  )}
                </div>
              )}

              {/* DELIVERY MARKETPLACE SUB-TAB */}
              {activeSubTab === 'marketplace' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 dark:text-white">Delivery Job Marketplace</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Available delivery jobs in your area. Accept requests matching your vehicle capacity.
                      </p>
                    </div>
                    
                    {/* Live reload pulse indicators */}
                    <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                      Live Feed
                    </div>
                  </div>

                  {availableJobs.length === 0 ? (
                    <div className="text-center py-16 bg-slate-50 dark:bg-slate-950/50 border border-gray-100 dark:border-slate-800 rounded-3xl p-8 space-y-4">
                      <Compass className="w-12 h-12 text-slate-400 mx-auto animate-spin" />
                      <h4 className="text-sm font-bold text-slate-750 dark:text-slate-200">Scanning for Jobs...</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                        Currently no pending delivery jobs are available in Lagos. High frequency blocks usually trigger when customers checkout escrow orders.
                      </p>
                      
                      {/* Simulation Trigger button to seed a job if empty */}
                      <button 
                        onClick={() => {
                          const state = getDBState();
                          const lastOrder = state.orders[state.orders.length - 1];
                          if (lastOrder) {
                            dbOperations.createDeliveryJob(lastOrder.id, 'STANDARD', 3500);
                            setDb(getDBState());
                          } else {
                            alert('No orders found to deliver. Please place an order first.');
                          }
                        }}
                        className="mx-auto flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[10px] px-3 py-2 rounded-xl cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Simulate Customer Delivery Request
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {availableJobs.map(job => {
                        const order = db.orders.find(o => o.id === job.orderId);
                        const buyer = db.users.find(u => u.id === order?.buyerId);
                        const seller = db.users.find(u => u.id === order?.sellerId);
                        const smartScore = 90 + (job.id % 10);
                        
                        return (
                          <div 
                            key={job.id}
                            className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-5 border border-gray-100 dark:border-slate-800/80 hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                          >
                            <div className="space-y-2 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/40 text-indigo-500 dark:text-indigo-400 px-2 py-0.5 rounded">
                                  {job.serviceType}
                                </span>
                                <span className="text-[10px] font-mono text-slate-400">
                                  Job ID: #JOB-{job.id}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                                <div>
                                  <span className="font-bold text-slate-400 block text-[9px] uppercase font-mono">Pickup Point (Seller)</span>
                                  <span className="font-medium text-slate-800 dark:text-slate-200">
                                    {seller?.fullName || 'Ikeja Vendor'} — Lagos, NG
                                  </span>
                                </div>
                                <div>
                                  <span className="font-bold text-slate-400 block text-[9px] uppercase font-mono">Delivery Point (Buyer)</span>
                                  <span className="font-medium text-slate-800 dark:text-slate-200">
                                    {buyer?.fullName || 'Victoria Island Client'} — Lagos, NG
                                  </span>
                                </div>
                              </div>

                              {/* Smart Match Compatibility Shield */}
                              <div className="mt-2.5 p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10 flex items-center justify-between gap-3 text-[11px] text-slate-600 dark:text-slate-400">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center font-black text-[10px] text-emerald-600">
                                    {smartScore}%
                                  </div>
                                  <div>
                                    <span className="font-bold text-slate-800 dark:text-white block text-[10px]">Smart Matching Suitability</span>
                                    <span className="text-[9px] text-slate-400">Rider matches cargo payload (Motorcycle) and current zone proximity.</span>
                                  </div>
                                </div>
                                <span className="text-[9px] font-mono text-emerald-600 font-bold bg-emerald-500/10 px-2 py-0.5 rounded shrink-0">
                                  RECOMMENDED
                                </span>
                              </div>
                            </div>

                            {/* Earnings breakdown & Accept CTA */}
                            <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-3 md:pt-0 border-gray-100 dark:border-slate-850">
                              <div className="text-right">
                                <span className="text-[9px] text-slate-400 uppercase tracking-wider font-mono">Courier Pay</span>
                                <p className="text-lg font-black text-emerald-500 font-mono">
                                  ₦{job.courierEarnings.toLocaleString()}
                                </p>
                                <span className="text-[9px] text-slate-400 block">
                                  Fee: ₦{job.deliveryFee.toLocaleString()}
                                </span>
                              </div>
                              <button
                                onClick={() => claimJob(job.id)}
                                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-transform active:scale-95"
                              >
                                Accept Delivery Job
                              </button>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              )}

              {/* ACTIVE JOBS SUB-TAB */}
              {activeSubTab === 'active_jobs' && (
                <div className="space-y-6">
                  {simulatedJob ? (
                    <div className="space-y-6">
                      
                      {/* Active Job summary header */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/20">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="bg-indigo-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase">
                              Active Journey
                            </span>
                            <span className="text-xs font-mono text-slate-500">
                              Job ID: #JOB-{simulatedJob.id}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-800 dark:text-white">
                            Delivering for Order #{simulatedJob.orderId}
                          </h4>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 font-mono uppercase block">Your Commission Payout</span>
                          <span className="text-xl font-black text-emerald-500 font-mono">
                            ₦{simulatedJob.courierEarnings.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Simulated Interactive Tracking controls */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        
                        {/* LEFT COLUMN: Map View simulation */}
                        <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-4 overflow-hidden relative min-h-[350px] shadow-lg flex flex-col justify-between text-white">
                          
                          {/* Map Widget Header overlay */}
                          <div className="absolute top-4 left-4 z-10 bg-slate-950/90 border border-slate-800 px-3 py-2 rounded-xl text-[10px] text-slate-400 font-mono space-y-0.5 shadow-md">
                            <div>📍 Dispatch Coordinates</div>
                            <div className="text-emerald-400 font-bold">
                              {mapLat.toFixed(5)}° N, {mapLng.toFixed(5)}° E
                            </div>
                          </div>

                          <div className="absolute top-4 right-4 z-10 bg-slate-950/90 border border-slate-800 px-3 py-2 rounded-xl text-[10px] text-slate-400 font-mono space-y-0.5 shadow-md text-right">
                            <div>⚡ Telemetry</div>
                            <div className="text-amber-400 font-bold">
                              {simSpeed} km/h • ETA: {simEta} mins
                            </div>
                          </div>

                          {/* Map canvas simulation layout */}
                          <div className="flex-1 flex items-center justify-center relative p-8">
                            <div className="absolute inset-0 bg-slate-950 opacity-20 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px]" />
                            
                            {/* Vector polyline line representing routing path */}
                            <svg className="absolute w-full h-full inset-0 pointer-events-none opacity-40">
                              <path 
                                d="M 120 120 Q 200 180, 280 240 T 400 300" 
                                fill="none" 
                                stroke="#10b981" 
                                strokeWidth="3" 
                                strokeDasharray="8 4" 
                                className="animate-[dash_40s_linear_infinite]"
                              />
                            </svg>

                            {/* Node 1: Pickup Point */}
                            <div className="absolute top-1/4 left-1/4 flex flex-col items-center">
                              <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center text-xs font-bold text-emerald-400 relative">
                                Vendor
                                <span className="absolute -top-1 -right-1 bg-emerald-500 w-2.5 h-2.5 rounded-full border border-slate-950" />
                              </div>
                            </div>

                            {/* Node 2: Courier active rider indicator */}
                            <div className="absolute top-1/2 left-1/2 flex flex-col items-center animate-pulse z-10">
                              <div className="w-10 h-10 rounded-full bg-indigo-500/30 border border-indigo-400 flex items-center justify-center text-xs shadow-xl relative">
                                🛵
                                <span className="absolute -top-1 -right-1 bg-indigo-500 w-3.5 h-3.5 rounded-full flex items-center justify-center border border-slate-950 text-[8px] font-bold">
                                  GPS
                                </span>
                              </div>
                            </div>

                            {/* Node 3: Buyer destination */}
                            <div className="absolute bottom-1/4 right-1/4 flex flex-col items-center">
                              <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/40 flex items-center justify-center text-xs text-indigo-300 relative">
                                Buyer
                                <span className="absolute -top-1 -right-1 bg-red-500 w-2.5 h-2.5 rounded-full border border-slate-950" />
                              </div>
                            </div>

                          </div>

                          {/* Map bottom stats */}
                          <div className="relative z-10 bg-slate-950 border border-slate-800 p-3 rounded-2xl flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-slate-400">
                              <Compass className="w-4 h-4 text-emerald-400 animate-spin" />
                              GoodDispatch™ GPS Active Connection
                            </span>
                            <span className="text-[10px] text-emerald-400 font-mono">
                              ONLINE
                            </span>
                          </div>

                        </div>

                        {/* RIGHT COLUMN: Journey log & Action panels */}
                        <div className="space-y-6">
                          
                          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-500">Journey Controls</h4>
                            
                            <div className="space-y-2">
                              {simulatedJob.status === DeliveryJobStatus.ACCEPTED && (
                                <button
                                  onClick={() => transitionJobStatus(DeliveryJobStatus.PICKED_UP)}
                                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-2"
                                >
                                  <Truck className="w-4 h-4" />
                                  Scan & Pickup Package
                                </button>
                              )}

                              {simulatedJob.status === DeliveryJobStatus.PICKED_UP && (
                                <button
                                  onClick={() => transitionJobStatus(DeliveryJobStatus.IN_TRANSIT)}
                                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-2"
                                >
                                  <Navigation className="w-4 h-4" />
                                  Trigger GPS Transit Simulation
                                </button>
                              )}

                              {simulatedJob.status === DeliveryJobStatus.IN_TRANSIT && (
                                <div className="p-3 bg-slate-100 dark:bg-slate-850 rounded-xl text-center text-xs text-slate-500 space-y-2">
                                  <div className="font-extrabold text-slate-700 dark:text-slate-300">
                                    Simulating GPS Routing...
                                  </div>
                                  <p className="text-[10px] text-slate-400">
                                    Driver is navigating Lagos roads. Coordinates, Speed, and ETAs are updating dynamically.
                                  </p>
                                </div>
                              )}

                              {[DeliveryJobStatus.ARRIVED].includes(simulatedJob.status) && (
                                <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-slate-800">
                                  
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono block">
                                      🔑 Buyer Verification PIN Code
                                    </label>
                                    <input 
                                      type="text"
                                      value={pinCode}
                                      onChange={(e) => setPinCode(e.target.value)}
                                      placeholder="Enter 4-Digit Code"
                                      maxLength={4}
                                      className="w-full text-center tracking-widest font-mono text-sm font-black px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 focus:outline-none"
                                    />
                                    <p className="text-[9px] text-slate-400">
                                      Ask the buyer for the unique 4-digit PIN generated on their invoice checkout.
                                    </p>
                                  </div>

                                  {pinError && (
                                    <p className="text-[10px] font-bold text-red-500">
                                      ❌ {pinError}
                                    </p>
                                  )}

                                  {pinSuccess && (
                                    <p className="text-[10px] font-bold text-emerald-500">
                                      🎉 Pin Verified! Earnings Released!
                                    </p>
                                  )}

                                  <button
                                    onClick={handleVerifyPin}
                                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-2"
                                  >
                                    <Check className="w-4 h-4" />
                                    Verify Code & Complete
                                  </button>

                                </div>
                              )}

                            </div>
                          </div>

                          {/* GoodDispatch Safety Center Panel */}
                          <div className="bg-red-500/5 dark:bg-red-950/10 p-5 rounded-2xl border border-red-500/20 space-y-4">
                            <div className="flex items-center gap-2">
                              <Shield className="w-5 h-5 text-red-500 shrink-0" />
                              <div>
                                <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-red-500">GoodDispatch™ Safety Center</h4>
                                <p className="text-[10px] text-slate-500">Emergency SOS routing and real-time incident reporting</p>
                              </div>
                            </div>

                            {sosSuccessMessage && (
                              <div className="p-3 bg-red-600 text-white rounded-xl text-[11px] font-semibold animate-pulse space-y-1">
                                <div>{sosSuccessMessage}</div>
                                <div className="font-mono text-[9px] opacity-90">GPS Coordinates: {mapLat.toFixed(5)}° N, {mapLng.toFixed(5)}° E</div>
                              </div>
                            )}

                            <div className="flex gap-2">
                              <button
                                onClick={handleTriggerSos}
                                className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase cursor-pointer select-none transition-all duration-350 text-center ${
                                  sosActive 
                                    ? 'bg-red-700 text-white animate-pulse' 
                                    : 'bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-500/20'
                                }`}
                              >
                                {sosActive ? '🚨 SOS EMERGENCY ACTIVE' : '🚨 Trigger SOS Panic'}
                              </button>

                              <button
                                onClick={() => setShowIncidentForm(!showIncidentForm)}
                                className="px-3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
                                title="Report mechanical failure, puncture or delay"
                              >
                                Report Incident
                              </button>
                            </div>

                            {showIncidentForm && (
                              <form onSubmit={handleReportIncident} className="space-y-3 pt-3 border-t border-red-500/10">
                                {incidentReported ? (
                                  <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl text-center text-xs font-bold">
                                    ✓ Safety incident reported to dispatch control! Log updated.
                                  </div>
                                ) : (
                                  <>
                                    <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Incident Type</label>
                                      <select
                                        value={incidentType}
                                        onChange={(e) => setIncidentType(e.target.value)}
                                        className="w-full text-xs px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 focus:outline-none"
                                      >
                                        <option value="VEHICLE_BREAKDOWN">Vehicle Breakdown / Mechanical Failure</option>
                                        <option value="TYRE_PUNCTURE">Tyre Puncture</option>
                                        <option value="HEAVY_TRAFFIC">Severe Traffic / Road Blockage</option>
                                        <option value="BAD_WEATHER">Heavy Rain / Flooding</option>
                                        <option value="POLICE_CHECKPOINT">Security Checkpoint Delay</option>
                                      </select>
                                    </div>

                                    <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Incident Details</label>
                                      <textarea
                                        value={incidentNote}
                                        onChange={(e) => setIncidentNote(e.target.value)}
                                        placeholder="Describe the incident (e.g. flat tyre on Third Mainland Bridge, ETA delay of 10 mins)"
                                        rows={2}
                                        className="w-full text-xs p-2 rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 focus:outline-none text-slate-850 dark:text-white"
                                      />
                                    </div>

                                    <button
                                      type="submit"
                                      className="w-full py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                                    >
                                      Submit Incident Log
                                    </button>
                                  </>
                                )}
                              </form>
                            )}
                          </div>

                          {/* Tracking Log History */}
                          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-500">Journey Log</h4>
                            <div className="space-y-3 text-[11px]">
                              {simulatedJob.trackingHistory?.map((log, idx) => (
                                <div key={idx} className="flex gap-2.5 items-start">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1 flex-shrink-0" />
                                  <div>
                                    <span className="font-extrabold text-slate-800 dark:text-slate-200 block">
                                      {log.status}
                                    </span>
                                    <span className="text-[10px] text-slate-400 block font-mono">
                                      {new Date(log.time).toLocaleTimeString()}
                                    </span>
                                    <p className="text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                                      {log.note || 'No description provided'}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                        </div>

                      </div>

                    </div>
                  ) : (
                    <div className="text-center py-16">
                      <Compass className="w-14 h-14 text-slate-300 mx-auto mb-4" />
                      <h4 className="text-base font-bold text-slate-800 dark:text-white">No Active Deliveries</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                        Go to the Delivery Marketplace tab to claim and accept new package courier requests!
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* EARNINGS SUB-TAB */}
              {activeSubTab === 'earnings' && (
                <div className="space-y-6">
                  
                  {/* Earnings Overview stats cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-5 border border-gray-100 dark:border-slate-800 space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Total Courier Earnings</span>
                      <p className="text-2xl font-black text-emerald-500 font-mono">
                        ₦{courierEarningsSum.toLocaleString()}
                      </p>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-5 border border-gray-100 dark:border-slate-800 space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Completed Jobs</span>
                      <p className="text-2xl font-black text-slate-850 dark:text-white">
                        {myCompletedJobs.length} Deliveries
                      </p>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-5 border border-gray-100 dark:border-slate-800 space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Rider Trust Rating</span>
                      <div className="flex items-center gap-1">
                        <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                        <p className="text-xl font-black text-slate-850 dark:text-white">
                          {courier?.rating ? courier.rating.toFixed(2) : '5.00'} / 5.0
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* History List of Completed deliveries */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-500">Logistics Earnings Log</h4>
                    {myCompletedJobs.length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-8">
                        No completed delivery payouts logged on your account yet. Complete your active jobs to credit your wallet instantly.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {myCompletedJobs.map(job => (
                          <div 
                            key={job.id}
                            className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-4 border border-gray-100 dark:border-slate-800/60 flex items-center justify-between text-xs"
                          >
                            <div className="space-y-1">
                              <span className="font-extrabold text-slate-800 dark:text-slate-200">
                                Delivery Job #{job.id} (Order #{job.orderId})
                              </span>
                              <span className="text-[10px] text-slate-400 block font-mono">
                                Completed At: {new Date(job.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <span className="font-black font-mono text-emerald-500">
                              +₦{job.courierEarnings.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>
          </div>

        </div>
      )}

    </div>
  );
}
