// components/DispatchDashboardView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  Truck, Shield, MapPin, Navigation, Compass, AlertCircle, CheckCircle2, 
  DollarSign, Clock, List, FileText, UserCheck, Check, Map, Eye,
  RefreshCw, TrendingUp, Key, Lock, Phone, User, Star, ChevronRight,
  Camera, CreditCard, Bike
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  getDBState, saveDBState, dbOperations, DeliveryPartner, DeliveryJob, DeliveryJobStatus, OrderStatus, UserRole, DeliveryVehicleType
} from '../lib/store';
import { SmartAvatar } from './ui/SmartImage';
import LiveDispatchMap from './LiveDispatchMap';
import { useLiveLocation } from '@/lib/hooks/useLiveLocation';
import { bestCoords, formatDistanceKm, haversineKm, estimateEtaMinutes, resolveCityCoords } from '@/lib/geo';
import { toast } from '@/lib/feedback';
import { deliveryStates, deliveryCitiesFor } from '@/lib/serviceAreas';

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
  const [photoUrl, setPhotoUrl] = useState('');
  const [licenseUrl, setLicenseUrl] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');
  
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<'selfie' | 'license' | 'vehicle' | null>(null);

  // Active tracking state
  const [activeJob, setActiveJob] = useState<DeliveryJob | null>(null);
  const [gpsBroadcasting, setGpsBroadcasting] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState(false);

  // Live GPS (rider)
  const liveGps = useLiveLocation({
    watch: true,
    throttleMs: 5000,
    enabled: true,
    highAccuracy: true,
  });

  const mapLat = liveGps.coords?.lat ?? activeJob?.currentLat ?? 6.5244;
  const mapLng = liveGps.coords?.lng ?? activeJob?.currentLng ?? 3.3792;
  const currentSpeed = activeJob?.currentSpeed ?? (liveGps.watching ? 25 : 0);

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
        const activeJobRecord = db.deliveryJobs.find(j => j.partnerId === courier.id && j.status !== DeliveryJobStatus.COMPLETED);
        if (activeJobRecord) {
          setActiveSubTab('active_jobs');
          setActiveJob(activeJobRecord);
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

  // Real document uploads for rider onboarding (stored in the private bucket).
  const handleDocUpload = async (
    kind: 'selfie' | 'license' | 'vehicle',
    file: File
  ) => {
    setFormError(null);
    setUploadingDoc(kind);
    try {
      const { uploadMedia } = await import('@/lib/upload');
      const url = await uploadMedia(file, 'government-ids');
      if (kind === 'selfie') setSelfieUrl(url);
      else if (kind === 'license') setLicenseUrl(url);
      else setPhotoUrl(url);
    } catch {
      setFormError('Document upload failed. Please check the file and try again.');
    } finally {
      setUploadingDoc(null);
    }
  };

  // Toggle Driver Active Availability Status
  const toggleAvailability = () => {
    if (!user || !courier) return;
    dbOperations.togglePartnerAvailability(
      user.id,
      !courier.isAvailable,
      liveGps.coords || undefined
    );
  };

  // Claim/Accept Delivery Job from Marketplace list
  const claimJob = (jobId: number) => {
    if (!courier) return;
    if (courier.status !== 'APPROVED') {
      toast.error('Only approved dispatch riders can accept delivery jobs.');
      return;
    }
    if (liveGps.coords) {
      dbOperations.updatePartnerLiveLocation(courier.id, liveGps.coords.lat, liveGps.coords.lng);
    }
    const updatedJob = dbOperations.acceptDeliveryJob(jobId, courier.id);
    if (updatedJob) {
      setActiveJob(updatedJob);
      setActiveSubTab('active_jobs');
      dbOperations.addAuditLog(user?.id || 0, 'ACCEPT_DELIVERY_JOB', 'deliveryJobs', jobId, `Courier accepted delivery request`);
    }
  };

  // Stream the rider's real device GPS to the buyer + seller while the job is moving.
  useEffect(() => {
    if (!activeJob || !liveGps.coords) return;
    const moving =
      activeJob.status === DeliveryJobStatus.PICKED_UP ||
      activeJob.status === DeliveryJobStatus.IN_TRANSIT;
    if (!moving) {
      setGpsBroadcasting(false);
      return;
    }
    const speed =
      typeof liveGps.accuracy === 'number'
        ? Math.max(8, Math.min(55, 40 - liveGps.accuracy / 5))
        : 28;

    setGpsBroadcasting(true);
    dbOperations.updateDeliveryJobStatus(activeJob.id, activeJob.status, {
      lat: liveGps.coords.lat,
      lng: liveGps.coords.lng,
      speed,
    });

    if (courier) {
      dbOperations.updatePartnerLiveLocation(courier.id, liveGps.coords.lat, liveGps.coords.lng);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveGps.coords?.lat, liveGps.coords?.lng, liveGps.accuracy, activeJob?.id, activeJob?.status, courier?.id]);

  // Keep active job synced from store (Realtime)
  useEffect(() => {
    if (!courier) return;
    const activeJobRecord = db.deliveryJobs.find(
      (j) => j.partnerId === courier.id && j.status !== DeliveryJobStatus.COMPLETED
    );
    if (activeJobRecord) setActiveJob(activeJobRecord);
  }, [db.deliveryJobs, courier?.id]);

  // Transition Active Job status
  const transitionJobStatus = (status: DeliveryJobStatus) => {
    if (!activeJob) return;
    
    if (status === DeliveryJobStatus.PICKED_UP) {
      if (liveGps.coords) {
        dbOperations.updateDeliveryJobStatus(activeJob.id, DeliveryJobStatus.PICKED_UP, {
          lat: liveGps.coords.lat,
          lng: liveGps.coords.lng,
          speed: 0,
        });
      } else {
        dbOperations.updateDeliveryJobStatus(activeJob.id, DeliveryJobStatus.PICKED_UP);
      }
    } else if (status === DeliveryJobStatus.IN_TRANSIT) {
      setGpsBroadcasting(true);
      if (liveGps.coords) {
        dbOperations.updateDeliveryJobStatus(activeJob.id, DeliveryJobStatus.IN_TRANSIT, {
          lat: liveGps.coords.lat,
          lng: liveGps.coords.lng,
          speed: 25,
        });
      } else {
        dbOperations.updateDeliveryJobStatus(activeJob.id, DeliveryJobStatus.IN_TRANSIT);
      }
    } else if (status === DeliveryJobStatus.ARRIVED) {
      setGpsBroadcasting(false);
      if (liveGps.coords) {
        dbOperations.updateDeliveryJobStatus(activeJob.id, DeliveryJobStatus.ARRIVED, {
          lat: liveGps.coords.lat,
          lng: liveGps.coords.lng,
          speed: 0,
        });
      } else {
        dbOperations.updateDeliveryJobStatus(activeJob.id, DeliveryJobStatus.ARRIVED);
      }
    }
  };

  // PIN code delivery completion handler
  const handleVerifyPin = async () => {
    if (!activeJob) return;
    if (!pinCode) {
      setPinError('Please enter the delivery PIN from the buyer.');
      return;
    }

    setPinError(null);
    setPinSuccess(false);

    const result = await dbOperations.completeDeliveryJobWithPin(activeJob.id, pinCode);
    if (result.success) {
      setPinSuccess(true);
      setActiveJob(null);
      setPinCode('');
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
    if (!activeJob) return;
    const state = getDBState();
    const job = state.deliveryJobs.find(j => j.id === activeJob.id);
    if (job) {
      job.trackingHistory.push({
        status: DeliveryJobStatus.IN_TRANSIT,
        time: new Date().toISOString(),
        note: `SOS EMERGENCY TRIGGERED: ${courier?.fullName || user?.fullName || 'Courier'} reported an active safety/security alert. Live coordinates: ${mapLat.toFixed(4)}° N, ${mapLng.toFixed(4)}° E.`
      });
      saveDBState(state);
      setDb(state);
      setSosActive(true);
      setSosSuccessMessage('Emergency SOS recorded. Your live coordinates were attached to this delivery and shared with the buyer and seller.');
      dbOperations.addAuditLog(user?.id || 0, 'SOS_ALERT', 'deliveryJobs', activeJob.id, `${courier?.fullName || user?.fullName || 'Courier'} triggered an SOS emergency signal`);
      setTimeout(() => setSosSuccessMessage(null), 8000);
    }
  };

  // Report transit incident
  const handleReportIncident = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeJob || !incidentNote.trim()) return;
    const state = getDBState();
    const job = state.deliveryJobs.find(j => j.id === activeJob.id);
    if (job) {
      const typeLabel = incidentType.replace('_', ' ');
      job.trackingHistory.push({
        status: DeliveryJobStatus.IN_TRANSIT,
        time: new Date().toISOString(),
        note: `DISPATCH INCIDENT [${typeLabel}]: ${incidentNote}`
      });
      saveDBState(state);
      setDb(state);
      setIncidentReported(true);
      setIncidentNote('');
      dbOperations.addAuditLog(user?.id || 0, 'INCIDENT_REPORTED', 'deliveryJobs', activeJob.id, `${courier?.fullName || user?.fullName || 'Courier'} logged a transit incident: ${typeLabel}`);
      setTimeout(() => {
        setIncidentReported(false);
        setShowIncidentForm(false);
      }, 4000);
    }
  };

  // Get matching delivery jobs sorted by proximity to rider GPS
  const riderOrigin = liveGps.coords ||
    (courier
      ? bestCoords(
          { lat: courier.lastLat, lng: courier.lastLng },
          null,
          courier.city,
          courier.state,
          courier.address
        )
      : resolveCityCoords('Lagos'));

  const availableJobs = db.deliveryJobs
    .filter((j) => j.status === DeliveryJobStatus.PENDING)
    .map((job) => {
      const order = db.orders.find((o) => o.id === job.orderId);
      const dest = bestCoords(
        { lat: order?.deliveryLat, lng: order?.deliveryLng },
        { lat: order?.pickupLat, lng: order?.pickupLng },
        order?.deliveryCity,
        order?.deliveryState,
        order?.deliveryAddress
      );
      const distanceKm = parseFloat(haversineKm(riderOrigin, dest).toFixed(1));
      const etaMinutes = estimateEtaMinutes(distanceKm);
      const smartScore = Math.max(
        55,
        Math.round(100 - distanceKm * 3 + (courier?.trustScore || 80) / 10)
      );
      return { job, order, dest, distanceKm, etaMinutes, smartScore };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const storeActiveJob = db.deliveryJobs.find(j => j.partnerId === courier?.id && j.status !== DeliveryJobStatus.COMPLETED);
  const myCompletedJobs = db.deliveryJobs.filter(j => j.partnerId === courier?.id && j.status === DeliveryJobStatus.COMPLETED);
  const courierEarningsSum = myCompletedJobs.reduce((acc, j) => acc + j.courierEarnings, 0);

  const activeOrder = activeJob
    ? db.orders.find((o) => o.id === activeJob.orderId)
    : undefined;
  const activeDest = activeOrder
    ? bestCoords(
        { lat: activeOrder.deliveryLat, lng: activeOrder.deliveryLng },
        null,
        activeOrder.deliveryCity,
        activeOrder.deliveryState,
        activeOrder.deliveryAddress
      )
    : null;
  const activePickup = activeOrder
    ? bestCoords(
        { lat: activeOrder.pickupLat, lng: activeOrder.pickupLng },
        null,
        undefined,
        undefined,
        undefined
      )
    : null;
  const eta =
    liveGps.coords && activeDest
      ? estimateEtaMinutes(haversineKm(liveGps.coords, activeDest), currentSpeed || 30)
      : activePickup && activeDest
        ? estimateEtaMinutes(haversineKm(activePickup, activeDest))
        : 25;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 font-sans" id="gooddispatch-dashboard">
      
      {/* Top Banner with visual brand identity */}
      <div className="bg-gradient-to-r from-jade-600 via-jade-800 to-ink-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden mb-8">
        <div className="absolute right-0 top-0 opacity-10 transform translate-x-12 -translate-y-12">
          <Truck className="w-96 h-96" />
        </div>
        <div className="relative z-10 space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-1.5 bg-jade-500/20 border border-jade-400/30 px-3 py-1 rounded-full text-xs font-semibold tracking-wide text-jade-300">
            <Shield className="w-3.5 h-3.5 text-ink-400" />
            GoodDispatch™ Smart Logistics
          </div>
          <h1 className="text-2xl md:text-4xl font-semibold tracking-tight">
            Logistics Dashboard
          </h1>
          <p className="text-xs md:text-sm text-jade-100 font-medium">
            Register as an elite logistics partner. Deliver verified escrow orders across Nigeria with real-time GPS tracking and instant secure wallet payouts.
          </p>
        </div>
      </div>

      {!user ? (
        <div className="text-center py-16 bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-800 rounded-3xl shadow-md p-8">
          <AlertCircle className="w-16 h-16 text-ink-500 mx-auto mb-4 animate-pulse" />
          <h3 className="text-lg font-bold text-ink-800 dark:text-white">Authentication Required</h3>
          <p className="text-xs text-ink-500 dark:text-ink-400 max-w-sm mx-auto mt-2">
            Please log in or register your account to access GoodDispatch™ Delivery Partner network on GoodSale.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Side Menu & Quick Profile Status */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-800 rounded-3xl p-6 shadow-sm space-y-6">
              
              {/* Profile Card */}
              <div className="flex items-center gap-3">
                <SmartAvatar 
                  src={courier?.photoUrl || db.profiles.find(p => p.userId === user.id)?.photoUrl}
                  name={courier?.fullName || user.fullName}
                  className="w-12 h-12 border-2 border-jade-500 shadow-sm"
                />
                <div>
                  <h4 className="text-sm font-semibold text-ink-800 dark:text-white truncate max-w-[150px]">
                    {courier?.fullName || user.fullName}
                  </h4>
                  <p className="text-xs text-ink-400 dark:text-ink-500 font-mono mt-0.5">
                    ID: GS-COURIER-{(courier?.id || 100).toString().padStart(4, '0')}
                  </p>
                </div>
              </div>

              {/* Verified Badge/State */}
              <div className="p-3 rounded-2xl bg-ink-50 dark:bg-ink-950 border border-ink-100 dark:border-ink-800 space-y-1.5 text-center">
                <span className="text-xs text-ink-400 dark:text-ink-500 tracking-wider font-semibold">Courier Application Status</span>
                <div>
                  {courier ? (
                    courier.status === 'APPROVED' ? (
                      <span className="inline-flex items-center gap-1 bg-jade-500/10 text-jade-600 dark:text-jade-400 text-xs px-3 py-1 rounded-full font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-jade-500" />
                        Approved Rider
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-ink-500/10 text-ink-600 dark:text-ink-400 text-xs px-3 py-1 rounded-full font-bold animate-pulse">
                        <Clock className="w-3.5 h-3.5 text-ink-500" />
                        Under Review
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-ink-100 dark:bg-ink-850 text-ink-500 dark:text-ink-400 text-xs px-3 py-1 rounded-full font-bold">
                      Not Registered
                    </span>
                  )}
                </div>
              </div>

              {/* Status Toggle Switch (Only for approved couriers) */}
              {courier && courier.status === 'APPROVED' && (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-jade-50/50 dark:bg-jade-950/20 border border-jade-100/30">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-ink-700 dark:text-ink-300 block">Duty Status</span>
                    <span className="text-xs text-ink-400 dark:text-ink-500 font-mono">
                      {courier.isAvailable ? 'ACTIVE / ONLINE' : 'OFFLINE'}
                    </span>
                  </div>
                  <button 
                    onClick={toggleAvailability}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${courier.isAvailable ? 'bg-jade-500' : 'bg-ink-300 dark:bg-ink-800'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${courier.isAvailable ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
              )}

              {/* Navigation Menu Links */}
              <div className="space-y-1.5 pt-4 border-t border-ink-100 dark:border-ink-800">
                {!courier && (
                  <button
                    onClick={() => setActiveSubTab('onboarding')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                      activeSubTab === 'onboarding' 
                        ? 'bg-jade-500 text-white shadow-sm' 
                        : 'text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-850'
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
                        ? 'bg-jade-500 text-white shadow-sm' 
                        : 'text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-850'
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
                          ? 'bg-jade-500 text-white shadow-sm' 
                          : 'text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-850'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <List className="w-4 h-4" />
                        Delivery Marketplace
                      </span>
                      {availableJobs.length > 0 && (
                        <span className="bg-jade-500 text-white text-xs font-semibold px-1.5 py-0.5 rounded-full">
                          {availableJobs.length}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => setActiveSubTab('active_jobs')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                        activeSubTab === 'active_jobs' 
                          ? 'bg-jade-500 text-white shadow-sm' 
                          : 'text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-850'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Navigation className="w-4 h-4" />
                        Active Job Tracker
                      </span>
                      {storeActiveJob && (
                        <span className="w-2.5 h-2.5 bg-jade-500 rounded-full animate-ping" />
                      )}
                    </button>

                    <button
                      onClick={() => setActiveSubTab('earnings')}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                        activeSubTab === 'earnings' 
                          ? 'bg-jade-500 text-white shadow-sm' 
                          : 'text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-850'
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
            <div className="bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-800 rounded-3xl p-6 md:p-8 shadow-sm min-h-[500px]">
              
              {/* ONBOARDING SUB-TAB */}
              {activeSubTab === 'onboarding' && (
                <div className="space-y-6">
                  {courier ? (
                    <div className="space-y-6 text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-ink-500/10 border border-ink-500/20 flex items-center justify-center mx-auto mb-4 animate-bounce">
                        <Clock className="w-8 h-8 text-ink-500" />
                      </div>
                      <h3 className="text-xl font-semibold text-ink-850 dark:text-white">Application Under Review</h3>
                      <p className="text-xs text-ink-500 dark:text-ink-400 max-w-md mx-auto leading-relaxed">
                        Thank you, <span className="font-semibold text-ink-800 dark:text-ink-200">{courier.fullName}</span>! Your courier profile and vehicle registration credentials for vehicle plate <span className="font-mono bg-ink-100 dark:bg-ink-800 px-1.5 py-0.5 rounded font-bold text-ink-850 dark:text-white">{courier.plateNumber}</span> are currently being reviewed by GoodSale Administrators.
                      </p>
                      
                      {/* Driver submitted specs summary */}
                      <div className="max-w-md mx-auto bg-ink-50 dark:bg-ink-950 p-4 rounded-2xl border border-ink-100 dark:border-ink-800 text-left space-y-2">
                        <h4 className="text-xs font-bold text-ink-700 dark:text-ink-300 tracking-wider font-mono">Submitted Credentials</h4>
                        <div className="grid grid-cols-2 gap-3 text-xs text-ink-600 dark:text-ink-400 font-sans">
                          <div><span className="text-ink-400 font-semibold block">Vehicle Type:</span> {courier.vehicleType}</div>
                          <div><span className="text-ink-400 font-semibold block">Plate Number:</span> {courier.plateNumber}</div>
                          <div><span className="text-ink-400 font-semibold block">Vehicle Brand:</span> {courier.brand} {courier.model}</div>
                          <div><span className="text-ink-400 font-semibold block">NIN ID Number:</span> {courier.nin.slice(0, 4)}*******</div>
                        </div>
                      </div>

                      <div className="mx-auto max-w-sm rounded-2xl bg-jade-50/50 p-3 text-xs font-medium text-jade-700 dark:bg-jade-950/20 dark:text-jade-400">
                        Estimated approval time: less than 24 hours.
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleRegister} className="space-y-6">
                      
                      <div className="space-y-1">
                        <h3 className="text-lg font-bold text-ink-800 dark:text-white">Delivery Partner Onboarding</h3>
                        <p className="text-xs text-ink-500 dark:text-ink-400">
                          Submit your vehicle specs, license, and national identity ID details to register as a Verified GoodDispatch™ rider.
                        </p>
                      </div>

                      {formError && (
                        <div className="p-4 bg-ink-500/10 text-ink-500 text-xs rounded-2xl border border-ink-500/20 font-medium flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>{formError}</span>
                        </div>
                      )}

                      {formSuccess && (
                        <div className="p-4 bg-jade-500/10 text-jade-500 text-xs rounded-2xl border border-jade-500/20 font-medium flex items-center gap-2">
                          <Check className="w-4 h-4 flex-shrink-0" />
                          <span>Onboarding application submitted successfully! Administrators will review your vehicle specs shortly.</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* 1. PERSONAL INFORMATION */}
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold tracking-wider font-mono text-jade-600 dark:text-jade-400">1. Personal Credentials</h4>
                          
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Full Name (Legal Name)</label>
                            <input 
                              type="text"
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              placeholder="e.g. Dele Coker"
                              className="w-full text-xs px-4 py-3 rounded-xl bg-ink-50 dark:bg-ink-950 border border-ink-100 dark:border-ink-800 focus:outline-none focus:border-jade-500 text-ink-850 dark:text-white font-medium"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Phone Number (Active)</label>
                            <input 
                              type="text"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              placeholder="e.g. 08123456789"
                              className="w-full text-xs px-4 py-3 rounded-xl bg-ink-50 dark:bg-ink-950 border border-ink-100 dark:border-ink-800 focus:outline-none focus:border-jade-500 text-ink-850 dark:text-white font-medium"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Email Address</label>
                            <input 
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="e.g. dele.coker@gmail.com"
                              className="w-full text-xs px-4 py-3 rounded-xl bg-ink-50 dark:bg-ink-950 border border-ink-100 dark:border-ink-800 focus:outline-none focus:border-jade-500 text-ink-850 dark:text-white font-medium"
                            />
                          </div>

                          {/* Coverage driven: riders may only work where GoodSale
                              has switched delivery on (admin → Coverage). */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-ink-500 dark:text-ink-400">State of Residence</label>
                              <select
                                value={stateName}
                                onChange={(e) => {
                                  const nextState = e.target.value;
                                  setStateName(nextState);
                                  const cities = deliveryCitiesFor(nextState);
                                  setCityName(cities[0] || '');
                                }}
                                className="w-full text-xs px-4 py-3 rounded-xl bg-ink-50 dark:bg-ink-950 border border-ink-100 dark:border-ink-800 text-ink-850 dark:text-white font-medium cursor-pointer"
                              >
                                {deliveryStates().map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-ink-500 dark:text-ink-400">City</label>
                              <select
                                value={cityName}
                                onChange={(e) => setCityName(e.target.value)}
                                className="w-full text-xs px-4 py-3 rounded-xl bg-ink-50 dark:bg-ink-950 border border-ink-100 dark:border-ink-800 text-ink-850 dark:text-white font-medium cursor-pointer"
                              >
                                {(deliveryCitiesFor(stateName).length
                                  ? deliveryCitiesFor(stateName)
                                  : [cityName].filter(Boolean)
                                ).map((c) => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {!dbOperations.isDeliveryArea(stateName, cityName) && (
                            <p className="rounded-xl bg-ink-500/10 px-3 py-2 text-xs font-semibold text-ink-600 dark:text-ink-300">
                              GoodSale does not accept deliveries in {cityName || 'this city'} yet. Choose a covered city — the admin team opens new areas regularly.
                            </p>
                          )}

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Address</label>
                            <input 
                              type="text"
                              value={address}
                              onChange={(e) => setAddress(e.target.value)}
                              placeholder="e.g. 22 Allen Avenue"
                              className="w-full text-xs px-4 py-3 rounded-xl bg-ink-50 dark:bg-ink-950 border border-ink-100 dark:border-ink-800 text-ink-850 dark:text-white font-medium"
                            />
                          </div>

                        </div>

                        {/* 2. VEHICLE SPECIFICATIONS */}
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold tracking-wider font-mono text-jade-600 dark:text-jade-400">2. Fleet Specs & Verification ID</h4>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Vehicle Type</label>
                              <select 
                                value={vehicleType}
                                onChange={(e) => setVehicleType(e.target.value as any)}
                                className="w-full text-xs px-3 py-3 rounded-xl bg-ink-50 dark:bg-ink-950 border border-ink-100 dark:border-ink-800 text-ink-850 dark:text-white font-semibold cursor-pointer"
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
                              <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Plate Number</label>
                              <input 
                                type="text"
                                value={plateNumber}
                                onChange={(e) => setPlateNumber(e.target.value)}
                                placeholder="e.g. LSR-432-AB"
                                className="w-full text-xs px-4 py-3 rounded-xl bg-ink-50 dark:bg-ink-950 border border-ink-100 dark:border-ink-800 text-ink-850 dark:text-white font-mono"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Vehicle Brand</label>
                              <input 
                                type="text"
                                value={brand}
                                onChange={(e) => setBrand(e.target.value)}
                                placeholder="e.g. Suzuki / TVS"
                                className="w-full text-xs px-4 py-3 rounded-xl bg-ink-50 dark:bg-ink-950 border border-ink-100 dark:border-ink-800 text-ink-850 dark:text-white font-medium"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Vehicle Model</label>
                              <input 
                                type="text"
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                placeholder="e.g. GR150 / Neo"
                                className="w-full text-xs px-4 py-3 rounded-xl bg-ink-50 dark:bg-ink-950 border border-ink-100 dark:border-ink-800 text-ink-850 dark:text-white font-medium"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Vehicle Color</label>
                              <input 
                                type="text"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                placeholder="e.g. Red"
                                className="w-full text-xs px-4 py-3 rounded-xl bg-ink-50 dark:bg-ink-950 border border-ink-100 dark:border-ink-800 text-ink-850 dark:text-white font-medium"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Capacity Box</label>
                              <input 
                                type="text"
                                value={capacity}
                                onChange={(e) => setCapacity(e.target.value)}
                                className="w-full text-xs px-4 py-3 rounded-xl bg-ink-50 dark:bg-ink-950 border border-ink-100 dark:border-ink-800 text-ink-850 dark:text-white font-medium"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-ink-500 dark:text-ink-400">NIN Card Number</label>
                              <input 
                                type="text"
                                value={nin}
                                onChange={(e) => setNin(e.target.value)}
                                placeholder="11 digit NIN"
                                maxLength={11}
                                className="w-full text-xs px-4 py-3 rounded-xl bg-ink-50 dark:bg-ink-950 border border-ink-100 dark:border-ink-800 text-ink-850 dark:text-white font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Driver License ID</label>
                              <input 
                                type="text"
                                value={licenseNumber}
                                onChange={(e) => setLicenseNumber(e.target.value)}
                                placeholder="e.g. DL-29381-XYZ"
                                className="w-full text-xs px-4 py-3 rounded-xl bg-ink-50 dark:bg-ink-950 border border-ink-100 dark:border-ink-800 text-ink-850 dark:text-white font-mono"
                              />
                            </div>
                          </div>

                        </div>

                      </div>

                      {/* 3. REQUIRED DOCUMENT UPLOADS (real files → private storage) */}
                      <div className="space-y-3 pt-4 border-t border-ink-100 dark:border-ink-800">
                        <h4 className="text-xs font-bold tracking-wider font-mono text-ink-500">3. Document Uploads</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {([
                            { key: 'selfie' as const, label: 'Selfie with Vehicle', Icon: Camera, url: selfieUrl },
                            { key: 'license' as const, label: "Driver's License Photo", Icon: CreditCard, url: licenseUrl },
                            { key: 'vehicle' as const, label: 'Vehicle Box Photo', Icon: Bike, url: photoUrl },
                          ]).map(({ key, label, Icon, url }) => (
                            <label
                              key={key}
                              className="border border-dashed border-ink-200 dark:border-ink-800 rounded-2xl p-4 text-center cursor-pointer hover:bg-ink-50 dark:hover:bg-ink-950/40 transition-colors block"
                            >
                              <Icon className="w-7 h-7 block mx-auto mb-1 text-jade-500" />
                              <span className="text-xs font-bold text-ink-700 dark:text-ink-300 block">{label}</span>
                              <span className="text-xs text-ink-400 mt-1 block">
                                {uploadingDoc === key
                                  ? 'Uploading…'
                                  : url
                                    ? 'Uploaded ✓'
                                    : 'Tap to upload (JPG/PNG/PDF)'}
                              </span>
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,application/pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) void handleDocUpload(key, file);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Onboarding submit button */}
                      <div className="flex justify-end pt-4">
                        <button
                          type="submit"
                          className="px-8 py-3 bg-gradient-to-r from-jade-500 to-jade-600 hover:from-jade-600 hover:to-jade-700 text-white font-sans font-bold text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 transition-transform active:scale-95"
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
                      <h3 className="text-lg font-bold text-ink-800 dark:text-white">Delivery Job Marketplace</h3>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        Available delivery jobs in your area. Accept requests matching your vehicle capacity.
                      </p>
                    </div>
                    
                    {/* Live reload pulse indicators */}
                    <div className="flex items-center gap-1 bg-jade-500/10 text-jade-600 dark:text-jade-400 text-xs font-bold px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 bg-jade-500 rounded-full animate-ping" />
                      Live Feed
                    </div>
                  </div>

                  {availableJobs.length === 0 ? (
                    <div className="text-center py-16 bg-ink-50 dark:bg-ink-950/50 border border-ink-100 dark:border-ink-800 rounded-3xl p-8 space-y-4">
                      <Compass className="w-12 h-12 text-ink-400 mx-auto animate-spin" />
                      <h4 className="text-sm font-bold text-ink-750 dark:text-ink-200">No open jobs right now</h4>
                      <p className="text-xs text-ink-500 dark:text-ink-400 max-w-sm mx-auto">
                        Delivery jobs appear here in real time the moment a buyer in your coverage area checks out an escrow order. Keep your duty status online to receive them.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {availableJobs.map(({ job, order, distanceKm, etaMinutes, smartScore }) => {
                        const buyer = db.users.find(u => u.id === order?.buyerId);
                        const seller = db.users.find(u => u.id === order?.sellerId);
                        
                        return (
                          <div 
                            key={job.id}
                            className="bg-ink-50 dark:bg-ink-950 rounded-2xl p-5 border border-ink-100 dark:border-ink-800/80 hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                          >
                            <div className="space-y-2 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold bg-jade-100 dark:bg-jade-950/40 text-jade-500 dark:text-jade-400 px-2 py-0.5 rounded">
                                  {job.serviceType}
                                </span>
                                <span className="text-xs font-mono text-ink-400">
                                  Job ID: #JOB-{job.id}
                                </span>
                                <span className="text-xs font-mono font-bold text-jade-600 bg-jade-500/10 px-2 py-0.5 rounded">
                                  {formatDistanceKm(distanceKm)} · ~{etaMinutes} mins
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs text-ink-600 dark:text-ink-400">
                                <div>
                                  <span className="font-bold text-ink-400 block text-xs font-mono">Pickup Point (Seller)</span>
                                  <span className="font-medium text-ink-800 dark:text-ink-200">
                                    {seller?.fullName || 'Seller'} — {order?.deliveryCity || 'Lagos'}
                                  </span>
                                </div>
                                <div>
                                  <span className="font-bold text-ink-400 block text-xs font-mono">Delivery Point (Buyer)</span>
                                  <span className="font-medium text-ink-800 dark:text-ink-200">
                                    {order?.deliveryAddress || buyer?.fullName || 'Buyer destination'}
                                  </span>
                                </div>
                              </div>

                              {/* Smart Match Compatibility Shield */}
                              <div className="mt-2.5 p-3 bg-jade-500/5 rounded-xl border border-jade-500/10 flex items-center justify-between gap-3 text-xs text-ink-600 dark:text-ink-400">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-jade-500/10 flex items-center justify-center font-bold text-xs text-jade-600">
                                    {smartScore}%
                                  </div>
                                  <div>
                                    <span className="font-bold text-ink-800 dark:text-white block text-xs">Proximity Smart Match</span>
                                    <span className="text-xs text-ink-400">
                                      Ranked by live GPS distance to buyer ({formatDistanceKm(distanceKm)} away).
                                    </span>
                                  </div>
                                </div>
                                <span className="text-xs font-mono text-jade-600 font-bold bg-jade-500/10 px-2 py-0.5 rounded shrink-0">
                                  NEAR YOU
                                </span>
                              </div>
                            </div>

                            {/* Earnings breakdown & Accept CTA */}
                            <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-3 md:pt-0 border-ink-100 dark:border-ink-850">
                              <div className="text-right">
                                <span className="text-xs text-ink-400 tracking-wider font-mono">Courier Pay</span>
                                <p className="text-lg font-bold text-jade-500 font-mono">
                                  ₦{job.courierEarnings.toLocaleString()}
                                </p>
                                <span className="text-xs text-ink-400 block">
                                  Fee: ₦{job.deliveryFee.toLocaleString()}
                                </span>
                              </div>
                              <button
                                onClick={() => claimJob(job.id)}
                                className="px-5 py-2.5 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-transform active:scale-95"
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
                  {activeJob ? (
                    <div className="space-y-6">
                      
                      {/* Active Job summary header */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-jade-50/50 dark:bg-jade-950/20 border border-jade-100/20">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="bg-jade-500 text-white text-xs font-semibold px-1.5 py-0.5 rounded">
                              Active Journey
                            </span>
                            <span className="text-xs font-mono text-ink-500">
                              Job ID: #JOB-{activeJob.id}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-ink-800 dark:text-white">
                            Delivering for Order #{activeJob.orderId}
                          </h4>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-ink-400 font-mono block">Your Commission Payout</span>
                          <span className="text-xl font-bold text-jade-500 font-mono">
                            ₦{activeJob.courierEarnings.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Live Google Maps tracking */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        
                        {/* LEFT COLUMN: Real Google Map */}
                        <div className="md:col-span-2">
                          <LiveDispatchMap
                            rider={{ lat: mapLat, lng: mapLng }}
                            destination={activeDest}
                            pickup={activePickup}
                            speedKmh={currentSpeed}
                            statusLabel={
                              gpsBroadcasting
                                ? 'Broadcasting live GPS'
                                : activeJob.status === DeliveryJobStatus.ARRIVED
                                  ? 'Arrived at destination'
                                  : 'Rider location'
                            }
                            geoError={liveGps.error}
                            gpsLocked={liveGps.source === 'gps'}
                            height="350px"
                          />
                        </div>

                        {/* RIGHT COLUMN: Journey log & Action panels */}
                        <div className="space-y-6">
                          
                          <div className="bg-ink-50 dark:bg-ink-950 p-4 rounded-2xl border border-ink-100 dark:border-ink-800 space-y-4">
                            <h4 className="text-xs font-bold tracking-wider font-mono text-ink-500">Journey Controls</h4>
                            
                            <div className="space-y-2">
                              {activeJob.status === DeliveryJobStatus.ACCEPTED && (
                                <button
                                  onClick={() => transitionJobStatus(DeliveryJobStatus.PICKED_UP)}
                                  className="w-full py-3 bg-jade-600 hover:bg-jade-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-2"
                                >
                                  <Truck className="w-4 h-4" />
                                  Scan & Pickup Package
                                </button>
                              )}

                              {activeJob.status === DeliveryJobStatus.PICKED_UP && (
                                <button
                                  onClick={() => transitionJobStatus(DeliveryJobStatus.IN_TRANSIT)}
                                  className="w-full py-3 bg-jade-600 hover:bg-jade-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-2"
                                >
                                  <Navigation className="w-4 h-4" />
                                  Start Live GPS Transit
                                </button>
                              )}

                              {activeJob.status === DeliveryJobStatus.IN_TRANSIT && (
                                <div className="p-3 bg-ink-100 dark:bg-ink-850 rounded-xl text-center text-xs text-ink-500 space-y-2">
                                  <div className="font-semibold text-ink-700 dark:text-ink-300">
                                    Live GPS sharing active
                                  </div>
                                  <p className="text-xs text-ink-400">
                                    Your phone location is streaming to buyer & seller maps. ETA ~{eta} mins.
                                  </p>
                                  <button
                                    onClick={() => transitionJobStatus(DeliveryJobStatus.ARRIVED)}
                                    className="w-full py-2.5 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-xl cursor-pointer"
                                  >
                                    Mark Arrived at Buyer
                                  </button>
                                </div>
                              )}

                              {[DeliveryJobStatus.ARRIVED].includes(activeJob.status) && (
                                <div className="space-y-4 pt-2 border-t border-ink-200 dark:border-ink-800">
                                  
                                  <div className="space-y-1">
                                    <label className="text-xs font-bold text-ink-500 tracking-wider font-mono block">
                                      Buyer Verification PIN Code
                                    </label>
                                    <input 
                                      type="text"
                                      value={pinCode}
                                      onChange={(e) => setPinCode(e.target.value)}
                                      placeholder="Enter 4-Digit Code"
                                      maxLength={4}
                                      className="w-full text-center tracking-widest font-mono text-sm font-bold px-4 py-2.5 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 focus:outline-none"
                                    />
                                    <p className="text-xs text-ink-400">
                                      Ask the buyer for the unique 4-digit PIN generated on their invoice checkout.
                                    </p>
                                  </div>

                                  {pinError && (
                                    <p className="text-xs font-bold text-ink-500">
                                      {pinError}
                                    </p>
                                  )}

                                  {pinSuccess && (
                                    <p className="text-xs font-bold text-jade-500">
                                      Pin Verified! Earnings Released!
                                    </p>
                                  )}

                                  <button
                                    onClick={handleVerifyPin}
                                    className="w-full py-3 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-2"
                                  >
                                    <Check className="w-4 h-4" />
                                    Verify Code & Complete
                                  </button>

                                </div>
                              )}

                            </div>
                          </div>

                          {/* GoodDispatch Safety Center Panel */}
                          <div className="bg-ink-500/5 dark:bg-ink-950/10 p-5 rounded-2xl border border-ink-500/20 space-y-4">
                            <div className="flex items-center gap-2">
                              <Shield className="w-5 h-5 text-ink-500 shrink-0" />
                              <div>
                                <h4 className="text-xs font-bold tracking-wider font-mono text-ink-500">GoodDispatch™ Safety Center</h4>
                                <p className="text-xs text-ink-500">Emergency SOS routing and real-time incident reporting</p>
                              </div>
                            </div>

                            {sosSuccessMessage && (
                              <div className="p-3 bg-jade-600 text-white rounded-xl text-xs font-semibold animate-pulse space-y-1">
                                <div>{sosSuccessMessage}</div>
                                <div className="font-mono text-xs opacity-90">GPS Coordinates: {mapLat.toFixed(5)}° N, {mapLng.toFixed(5)}° E</div>
                              </div>
                            )}

                            <div className="flex gap-2">
                              <button
                                onClick={handleTriggerSos}
                                className={`flex-1 py-2.5 rounded-xl font-bold text-xs cursor-pointer select-none transition-all duration-350 text-center ${
                                  sosActive 
                                    ? 'bg-ink-700 text-white animate-pulse' 
                                    : 'bg-ink-600 hover:bg-ink-700 text-white shadow-md shadow-ink-500/20'
                                }`}
                              >
                                {sosActive ? 'SOS EMERGENCY ACTIVE' : 'Trigger SOS Panic'}
                              </button>

                              <button
                                onClick={() => setShowIncidentForm(!showIncidentForm)}
                                className="px-3 py-2.5 bg-ink-100 dark:bg-ink-800 hover:bg-ink-200 dark:hover:bg-ink-750 text-ink-700 dark:text-ink-300 font-bold text-xs rounded-xl cursor-pointer"
                                title="Report mechanical failure, puncture or delay"
                              >
                                Report Incident
                              </button>
                            </div>

                            {showIncidentForm && (
                              <form onSubmit={handleReportIncident} className="space-y-3 pt-3 border-t border-ink-500/10">
                                {incidentReported ? (
                                  <div className="p-3 bg-jade-500/10 text-jade-600 dark:text-jade-400 rounded-xl text-center text-xs font-bold">
                                    Safety incident reported to dispatch control. Log updated.
                                  </div>
                                ) : (
                                  <>
                                    <div className="space-y-1">
                                      <label className="text-xs font-bold text-ink-400 tracking-wider font-mono">Incident Type</label>
                                      <select
                                        value={incidentType}
                                        onChange={(e) => setIncidentType(e.target.value)}
                                        className="w-full text-xs px-2 py-1.5 rounded-lg bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 focus:outline-none"
                                      >
                                        <option value="VEHICLE_BREAKDOWN">Vehicle Breakdown / Mechanical Failure</option>
                                        <option value="TYRE_PUNCTURE">Tyre Puncture</option>
                                        <option value="HEAVY_TRAFFIC">Severe Traffic / Road Blockage</option>
                                        <option value="BAD_WEATHER">Heavy Rain / Flooding</option>
                                        <option value="POLICE_CHECKPOINT">Security Checkpoint Delay</option>
                                      </select>
                                    </div>

                                    <div className="space-y-1">
                                      <label className="text-xs font-bold text-ink-400 tracking-wider font-mono">Incident Details</label>
                                      <textarea
                                        value={incidentNote}
                                        onChange={(e) => setIncidentNote(e.target.value)}
                                        placeholder="Describe the incident (e.g. flat tyre on Third Mainland Bridge, ETA delay of 10 mins)"
                                        rows={2}
                                        className="w-full text-xs p-2 rounded-lg bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 focus:outline-none text-ink-850 dark:text-white"
                                      />
                                    </div>

                                    <button
                                      type="submit"
                                      className="w-full py-2 bg-jade-600 hover:bg-jade-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                                    >
                                      Submit Incident Log
                                    </button>
                                  </>
                                )}
                              </form>
                            )}
                          </div>

                          {/* Tracking Log History */}
                          <div className="bg-ink-50 dark:bg-ink-950 p-4 rounded-2xl border border-ink-100 dark:border-ink-800 space-y-3">
                            <h4 className="text-xs font-bold tracking-wider font-mono text-ink-500">Journey Log</h4>
                            <div className="space-y-3 text-xs">
                              {activeJob.trackingHistory?.map((log, idx) => (
                                <div key={idx} className="flex gap-2.5 items-start">
                                  <span className="w-1.5 h-1.5 rounded-full bg-jade-500 mt-1 flex-shrink-0" />
                                  <div>
                                    <span className="font-semibold text-ink-800 dark:text-ink-200 block">
                                      {log.status}
                                    </span>
                                    <span className="text-xs text-ink-400 block font-mono">
                                      {new Date(log.time).toLocaleTimeString()}
                                    </span>
                                    <p className="text-ink-500 dark:text-ink-400 mt-0.5 leading-tight">
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
                      <Compass className="w-14 h-14 text-ink-300 mx-auto mb-4" />
                      <h4 className="text-base font-bold text-ink-800 dark:text-white">No Active Deliveries</h4>
                      <p className="text-xs text-ink-500 dark:text-ink-400 max-w-sm mx-auto mt-1">
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
                    <div className="bg-ink-50 dark:bg-ink-950 rounded-2xl p-5 border border-ink-100 dark:border-ink-800 space-y-1">
                      <span className="text-xs font-bold text-ink-400 tracking-wider font-mono">Total Courier Earnings</span>
                      <p className="text-2xl font-bold text-jade-500 font-mono">
                        ₦{courierEarningsSum.toLocaleString()}
                      </p>
                    </div>

                    <div className="bg-ink-50 dark:bg-ink-950 rounded-2xl p-5 border border-ink-100 dark:border-ink-800 space-y-1">
                      <span className="text-xs font-bold text-ink-400 tracking-wider font-mono">Completed Jobs</span>
                      <p className="text-2xl font-bold text-ink-850 dark:text-white">
                        {myCompletedJobs.length} Deliveries
                      </p>
                    </div>

                    <div className="bg-ink-50 dark:bg-ink-950 rounded-2xl p-5 border border-ink-100 dark:border-ink-800 space-y-1">
                      <span className="text-xs font-bold text-ink-400 tracking-wider font-mono">Rider Trust Rating</span>
                      <div className="flex items-center gap-1">
                        <Star className="star-filled w-5 h-5" />
                        <p className="text-xl font-bold text-ink-850 dark:text-white">
                          {courier?.rating ? courier.rating.toFixed(2) : '5.00'} / 5.0
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* History List of Completed deliveries */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold tracking-wider font-mono text-ink-500">Logistics Earnings Log</h4>
                    {myCompletedJobs.length === 0 ? (
                      <p className="text-xs text-ink-400 italic text-center py-8">
                        No completed delivery payouts logged on your account yet. Complete your active jobs to credit your wallet instantly.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {myCompletedJobs.map(job => (
                          <div 
                            key={job.id}
                            className="bg-ink-50 dark:bg-ink-950 rounded-2xl p-4 border border-ink-100 dark:border-ink-800/60 flex items-center justify-between text-xs"
                          >
                            <div className="space-y-1">
                              <span className="font-semibold text-ink-800 dark:text-ink-200">
                                Delivery Job #{job.id} (Order #{job.orderId})
                              </span>
                              <span className="text-xs text-ink-400 block font-mono">
                                Completed At: {new Date(job.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <span className="font-bold font-mono text-jade-500">
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
