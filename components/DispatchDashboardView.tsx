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
import type { DeliveryStatus } from '@/lib/types';
import { SmartAvatar } from './ui/SmartImage';
import LiveDispatchMap from './LiveDispatchMap';
import { useLiveLocation } from '@/lib/hooks/useLiveLocation';
import { bestCoords, haversineKm, estimateEtaMinutes } from '@/lib/geo';
import { toast } from '@/lib/feedback';
import { deliveryStates, deliveryCitiesFor } from '@/lib/serviceAreas';
import { deliveryStatusLabel, isDeliveryTerminal, nextDeliveryStatuses } from '@/lib/delivery';
import { DeliveryStatusBadge } from './DeliveryTimeline';
import RiderDeliveryCard from './RiderDeliveryCard';
import RiderRequestsPanel from './RiderRequestsPanel';
import RiderEarningsPanel from './RiderEarningsPanel';
import RiderAvailabilityPanel from './RiderAvailabilityPanel';
import RiderProfilePanel from './RiderProfilePanel';

type RiderTab =
  | 'onboarding'
  | 'overview'
  | 'marketplace'
  | 'my_deliveries'
  | 'active_jobs'
  | 'history'
  | 'earnings'
  | 'profile'
  | 'availability';

export default function DispatchDashboardView() {
  const [db, setDb] = useState(getDBState());
  const [activeSubTab, setActiveSubTab] = useState<RiderTab>('onboarding');
  
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
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('');
  const [serviceStates, setServiceStates] = useState<string[]>([]);
  
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);
  const [reapply, setReapply] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<'selfie' | 'license' | 'vehicle' | null>(null);

  // Active tracking state
  const [activeJob, setActiveJob] = useState<DeliveryJob | null>(null);
  const [gpsBroadcasting, setGpsBroadcasting] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState(false);

  // Canonical delivery confirmation (buyer's one-time code)
  const [deliveryCode, setDeliveryCode] = useState('');
  const [deliveryCodeError, setDeliveryCodeError] = useState<string | null>(null);
  const [deliveryBusy, setDeliveryBusy] = useState(false);

  // Request GPS only for an approved, online rider with an active delivery.
  const locationRider = db.deliveryPartners.find((partner) => partner.userId === db.currentUser?.id);
  const canWatchRiderGps = Boolean(
    locationRider?.status === 'APPROVED' &&
    locationRider.isAvailable &&
    activeJob &&
    activeJob.status !== DeliveryJobStatus.COMPLETED &&
    activeJob.status !== DeliveryJobStatus.CANCELLED
  );
  const liveGps = useLiveLocation({
    watch: true,
    throttleMs: 5000,
    enabled: canWatchRiderGps,
    highAccuracy: true,
    fallback: null,
  });

  const mapLocation = canWatchRiderGps && liveGps.source === 'gps' ? liveGps.coords : null;
  const currentSpeed = liveGps.source === 'gps' ? liveGps.speedKmh : null;

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

  // Keep the approved rider on their current tab; everyone else stays on the
  // application/status screen. Suspension immediately removes dashboard access.
  useEffect(() => {
    if (courier?.status === 'APPROVED') {
      setActiveSubTab((current) => (current === 'onboarding' ? 'overview' : current));
    } else if (activeSubTab !== 'onboarding') {
      setActiveSubTab('onboarding');
    }
  }, [courier?.id, courier?.status, activeSubTab]);

  // Handle Courier Registration Onboarding
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setFormError('Please log in first to apply as a Delivery Partner.');
      return;
    }

    const needsPlate = !['BICYCLE', 'LOGISTICS', 'FLEET'].includes(vehicleType);
    if (!fullName || !phone || !email || !nin || !address || !stateName || !cityName) {
      setFormError('Please complete your name, contact, operating location and government ID.');
      return;
    }
    if (needsPlate && !plateNumber) {
      setFormError('Enter your vehicle registration number, or choose Bicycle / Logistics / Fleet.');
      return;
    }
    if (!dbOperations.isDeliveryArea(stateName, cityName)) {
      setFormError('Choose a city where GoodDispatch delivery is available.');
      return;
    }

    setFormError(null);
    setFormSuccess(false);
    const documents = [
      selfieUrl ? { label: 'Selfie with vehicle', url: selfieUrl, kind: 'SELFIE' } : null,
      licenseUrl ? { label: "Driver's licence", url: licenseUrl, kind: 'LICENSE' } : null,
      photoUrl ? { label: 'Vehicle photo', url: photoUrl, kind: 'VEHICLE' } : null,
      nin ? { label: 'NIN number', url: '', kind: 'IDENTITY', note: nin } : null,
      licenseNumber
        ? { label: "Driver's licence number", url: '', kind: 'LICENSE', note: licenseNumber }
        : null,
    ].filter(Boolean);

    const result = await dbOperations.riderApply({
      fullName,
      phone,
      email,
      vehicleType,
      brand,
      model,
      plateNumber,
      color,
      year: parseInt(year) || undefined,
      capacity,
      address,
      state: stateName,
      city: cityName,
      nin,
      selfieUrl,
      licenseUrl: licenseUrl || null,
      photoUrl,
      documents,
      emergencyContactName: emergencyName,
      emergencyContactPhone: emergencyPhone,
      emergencyContactRelation: emergencyRelation,
      serviceStates: serviceStates.length ? serviceStates : [stateName],
    });

    if (result.error) {
      setFormError(result.error);
      return;
    }
    setFormSuccess(true);
    setDb(getDBState());
    toast.success('Rider application submitted for review.');
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

  // Stream the rider's real device GPS to the buyer + seller while the job is moving.
  useEffect(() => {
    if (!activeJob || !liveGps.coords) return;
    const moving =
      (activeJob.status === DeliveryJobStatus.PICKED_UP ||
        activeJob.status === DeliveryJobStatus.IN_TRANSIT) &&
      courier?.isAvailable &&
      liveGps.source === 'gps';
    if (!moving) {
      setGpsBroadcasting(false);
      return;
    }
    setGpsBroadcasting(true);
    dbOperations.updateDeliveryJobStatus(activeJob.id, activeJob.status, {
      lat: liveGps.coords.lat,
      lng: liveGps.coords.lng,
      speed: liveGps.speedKmh ?? undefined,
    });

    if (courier) {
      dbOperations.updatePartnerLiveLocation(courier.id, liveGps.coords.lat, liveGps.coords.lng);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveGps.coords?.lat, liveGps.coords?.lng, liveGps.accuracy, liveGps.speedKmh, liveGps.source, activeJob?.id, activeJob?.status, courier?.id, courier?.isAvailable]);

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
          ...(liveGps.speedKmh != null ? { speed: liveGps.speedKmh } : {}),
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
  // Canonical delivery lifecycle (separate from the legacy dispatch job)
  const advanceCanonicalDelivery = async (status: DeliveryStatus) => {
    if (!activeJob) return;
    const delivery = (db.deliveries || []).find(d => d.orderId === activeJob.orderId);
    if (!delivery) return;
    const result = await dbOperations.advanceDelivery(delivery.id, status, {
      note: `Rider updated delivery to ${deliveryStatusLabel(status)}`,
    });
    if ('error' in result && result.error) {
      toast.error(result.error);
      return;
    }
    setDb(getDBState());
    toast.success(`Delivery updated: ${deliveryStatusLabel(status)}`);
  };

  const handleConfirmDeliveryCode = async () => {
    if (!activeJob) return;
    const delivery = (db.deliveries || []).find(d => d.orderId === activeJob.orderId);
    if (!delivery) return;
    if (!/^\d{4,8}$/.test(deliveryCode.trim())) {
      setDeliveryCodeError('Enter the buyer’s confirmation code.');
      return;
    }
    setDeliveryBusy(true);
    setDeliveryCodeError(null);
    const result = await dbOperations.confirmDeliveryWithCode(delivery.id, deliveryCode.trim());
    setDeliveryBusy(false);
    if ('error' in result && result.error) {
      setDeliveryCodeError(result.error);
      return;
    }
    setDeliveryCode('');
    setDb(getDBState());
    toast.success('Delivery confirmed. The buyer still releases escrow separately.');
  };

  const handleTriggerSos = () => {
    if (!activeJob) return;
    const state = getDBState();
    const job = state.deliveryJobs.find(j => j.id === activeJob.id);
    if (job) {
      job.trackingHistory.push({
        status: DeliveryJobStatus.IN_TRANSIT,
        time: new Date().toISOString(),
        note: `SOS EMERGENCY TRIGGERED: ${courier?.fullName || user?.fullName || 'Courier'} reported an active safety/security alert.${liveGps.source === 'gps' && liveGps.coords ? ` Live GPS coordinates: ${liveGps.coords.lat.toFixed(4)}, ${liveGps.coords.lng.toFixed(4)}.` : ' No current GPS fix was available.'}`
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
        note: `DISPATCH INCIDENT [${typeLabel}]: ${incidentNote}${liveGps.source === 'gps' && liveGps.coords ? ` · GPS ${liveGps.coords.lat.toFixed(4)}, ${liveGps.coords.lng.toFixed(4)}` : ''}`
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

  const activeDelivery = activeJob
    ? (db.deliveries || []).find((delivery) => delivery.orderId === activeJob.orderId)
    : undefined;
  const myCompletedJobs = db.deliveryJobs.filter(j => j.partnerId === courier?.id && j.status === DeliveryJobStatus.COMPLETED);
  const courierEarningsSum = myCompletedJobs.reduce((acc, j) => acc + j.courierEarnings, 0);

  const myDeliveries = courier ? db.deliveries.filter((d) => d.riderId === courier.id) : [];
  const myOpenDeliveries = myDeliveries.filter(
    (d) => !isDeliveryTerminal(d.status) && !['FAILED_DELIVERY', 'RETURNED_TO_SELLER', 'CANCELLED'].includes(d.status)
  );
  const myOfferedDeliveries = myOpenDeliveries.filter((d) => d.assignmentStatus === 'OFFERED');
  const myActiveDeliveries = myOpenDeliveries.filter((d) => d.assignmentStatus === 'ACCEPTED');
  const myHistoryDeliveries = myDeliveries
    .filter((d) => ['DELIVERED', 'FAILED_DELIVERY', 'RETURNED_TO_SELLER', 'CANCELLED'].includes(d.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const myEarnings = courier ? db.riderEarnings.filter((e) => e.riderId === courier.id) : [];
  const pendingEarnings = myEarnings.filter((e) => e.status === 'PENDING').reduce((sum, e) => sum + e.netAmount, 0);

  const activeOrder = activeJob
    ? db.orders.find((o) => o.id === activeJob.orderId)
    : undefined;
  const activeDest = activeOrder?.deliveryLat != null && activeOrder.deliveryLng != null
    ? { lat: activeOrder.deliveryLat, lng: activeOrder.deliveryLng }
    : null;
  const activePickup = activeOrder?.pickupLat != null && activeOrder.pickupLng != null
    ? { lat: activeOrder.pickupLat, lng: activeOrder.pickupLng }
    : null;

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

              {/* Navigation — horizontal swipe on phones, stacked on desktop */}
              <div className="flex gap-1.5 overflow-x-auto border-t border-ink-100 pt-4 pb-1 dark:border-ink-800 lg:block lg:space-y-1.5 lg:overflow-visible">
                {(courier?.status === 'APPROVED'
                  ? ([
                      { id: 'overview', label: 'Overview', Icon: Compass },
                      { id: 'marketplace', label: 'Available', Icon: List },
                      { id: 'my_deliveries', label: 'My Deliveries', Icon: Truck },
                      { id: 'active_jobs', label: 'Active Delivery', Icon: Navigation },
                      { id: 'history', label: 'History', Icon: Clock },
                      { id: 'earnings', label: 'Earnings', Icon: DollarSign },
                      { id: 'profile', label: 'Profile', Icon: User },
                      { id: 'availability', label: 'Availability', Icon: MapPin },
                    ] as { id: RiderTab; label: string; Icon: React.ElementType }[])
                  : ([{ id: 'onboarding', label: courier ? 'Application' : 'Rider Onboarding', Icon: UserCheck }] as {
                      id: RiderTab;
                      label: string;
                      Icon: React.ElementType;
                    }[])
                ).map(({ id, label, Icon }) => {
                  const badge =
                    id === 'my_deliveries' && myOpenDeliveries.length > 0
                      ? String(myOpenDeliveries.length)
                      : id === 'active_jobs' && myActiveDeliveries.length > 0
                        ? '•'
                        : null;
                  return (
                    <button
                      key={id}
                      onClick={() => setActiveSubTab(id)}
                      className={`flex w-auto shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-all lg:w-full ${
                        activeSubTab === id
                          ? 'bg-jade-500 text-white shadow-sm'
                          : 'text-ink-600 hover:bg-ink-50 dark:text-ink-400 dark:hover:bg-ink-850'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4" />
                        {label}
                      </span>
                      {badge && (
                        <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

            </div>
          </div>

          {/* Main SubTab Content Container */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-800 rounded-3xl p-6 md:p-8 shadow-sm min-h-[500px]">
              
              {/* ONBOARDING SUB-TAB */}
              {activeSubTab === 'onboarding' && (
                <div className="space-y-6">
                  {courier && (courier.status !== 'REJECTED' || !reapply) ? (
                    <div className="space-y-6 text-center py-12">
                      <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border ${
                        courier.status === 'APPROVED'
                          ? 'border-jade-500/30 bg-jade-500/10'
                          : courier.status === 'SUSPENDED'
                            ? 'border-gold-500/30 bg-gold-500/10'
                            : 'border-ink-500/20 bg-ink-500/10'
                      }`}>
                        {courier.status === 'APPROVED' ? (
                          <CheckCircle2 className="h-8 w-8 text-jade-500" />
                        ) : courier.status === 'SUSPENDED' ? (
                          <AlertCircle className="h-8 w-8 text-gold-600" />
                        ) : (
                          <Clock className="h-8 w-8 text-ink-500" />
                        )}
                      </div>
                      <h3 className="text-xl font-semibold text-ink-850 dark:text-white">
                        {courier.status === 'APPROVED'
                          ? 'Rider account approved'
                          : courier.status === 'SUSPENDED'
                            ? 'Rider account suspended'
                            : courier.status === 'REJECTED'
                              ? 'Application rejected'
                              : 'Application under review'}
                      </h3>
                      <p className="mx-auto max-w-md text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                        {courier.status === 'APPROVED'
                          ? 'You can receive delivery requests. Use the Availability tab to go online.'
                          : courier.status === 'SUSPENDED'
                            ? courier.suspensionReason || 'Contact GoodSale support to resolve this suspension.'
                            : courier.status === 'REJECTED'
                              ? courier.rejectionReason || 'Contact support for details, then submit a new application.'
                              : `Thank you, ${courier.fullName}. Your identity and vehicle documents are being reviewed by GoodSale administrators.`}
                      </p>

                      {/* Driver submitted specs summary */}
                      <div className="mx-auto max-w-md space-y-2 rounded-2xl border border-ink-100 bg-ink-50 p-4 text-left dark:border-ink-800 dark:bg-ink-950">
                        <h4 className="font-mono text-xs font-bold tracking-wider text-ink-700 dark:text-ink-300">Submitted credentials</h4>
                        <div className="grid grid-cols-2 gap-3 font-sans text-xs text-ink-600 dark:text-ink-400">
                          <div><span className="block font-semibold text-ink-400">Vehicle type:</span> {courier.vehicleType}</div>
                          <div><span className="block font-semibold text-ink-400">Registration:</span> {courier.plateNumber || 'N/A'}</div>
                          <div><span className="block font-semibold text-ink-400">Vehicle:</span> {[courier.brand, courier.model].filter(Boolean).join(' ') || '—'}</div>
                          <div><span className="block font-semibold text-ink-400">NIN:</span> {courier.nin ? `${courier.nin.slice(0, 4)}*******` : 'Uploaded'}</div>
                          <div><span className="block font-semibold text-ink-400">Service area:</span> {[courier.city, courier.state].filter(Boolean).join(', ') || '—'}</div>
                          <div><span className="block font-semibold text-ink-400">Documents:</span> {courier.documents?.length ?? 0} uploaded</div>
                        </div>
                      </div>

                      {courier.status === 'PENDING' && (
                        <div className="mx-auto max-w-sm rounded-2xl bg-jade-50/50 p-3 text-xs font-medium text-jade-700 dark:bg-jade-950/20 dark:text-jade-400">
                          Estimated approval time: less than 24 hours.
                        </div>
                      )}
                      {courier.status === 'REJECTED' && (
                        <button
                          onClick={() => setReapply(true)}
                          className="rounded-xl bg-jade-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-jade-700"
                        >
                          Update and re-apply
                        </button>
                      )}
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

                      {/* Emergency contact + service area */}
                      <div className="space-y-4 border-t border-ink-100 pt-4 dark:border-ink-800">
                        <h4 className="font-mono text-xs font-bold tracking-wider text-jade-600 dark:text-jade-400">3. Emergency contact & service area</h4>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Emergency contact name</label>
                            <input
                              type="text"
                              value={emergencyName}
                              onChange={(e) => setEmergencyName(e.target.value)}
                              placeholder="e.g. Ada Coker"
                              className="w-full rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 text-xs font-medium text-ink-850 dark:border-ink-800 dark:bg-ink-950 dark:text-white"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Emergency phone</label>
                            <input
                              type="tel"
                              value={emergencyPhone}
                              onChange={(e) => setEmergencyPhone(e.target.value)}
                              placeholder="e.g. 0803 000 0000"
                              className="w-full rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 text-xs font-medium text-ink-850 dark:border-ink-800 dark:bg-ink-950 dark:text-white"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Relationship</label>
                            <input
                              type="text"
                              value={emergencyRelation}
                              onChange={(e) => setEmergencyRelation(e.target.value)}
                              placeholder="e.g. Sister"
                              className="w-full rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 text-xs font-medium text-ink-850 dark:border-ink-800 dark:bg-ink-950 dark:text-white"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Additional service states (optional)</label>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {deliveryStates().map((state) => {
                              const selected = serviceStates.includes(state);
                              return (
                                <button
                                  key={state}
                                  type="button"
                                  onClick={() =>
                                    setServiceStates((current) =>
                                      current.includes(state)
                                        ? current.filter((item) => item !== state)
                                        : [...current, state]
                                    )
                                  }
                                  className={`rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${
                                    selected
                                      ? 'border-jade-500 bg-jade-500 text-white'
                                      : 'border-ink-200 bg-white text-ink-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300'
                                  }`}
                                >
                                  {state.replace(' State', '')}
                                </button>
                              );
                            })}
                          </div>
                          <p className="mt-1 text-[10px] text-ink-400">
                            Leave empty to receive requests only in {stateName}. You can change this later in Availability.
                          </p>
                        </div>
                      </div>

                      {/* 4. REQUIRED DOCUMENT UPLOADS (real files → private storage) */}
                      <div className="space-y-3 pt-4 border-t border-ink-100 dark:border-ink-800">
                        <h4 className="text-xs font-bold tracking-wider font-mono text-ink-500">4. Document uploads</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {([
                            { key: 'selfie' as const, label: 'Profile photo / selfie', Icon: Camera, url: selfieUrl },
                            { key: 'license' as const, label: "Driver's licence", Icon: CreditCard, url: licenseUrl },
                            { key: 'vehicle' as const, label: 'Vehicle photo', Icon: Bike, url: photoUrl },
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

              {/* OVERVIEW */}
              {activeSubTab === 'overview' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">
                        Welcome back, {courier?.fullName?.split(' ')[0] || 'rider'}
                      </h3>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        {courier?.isAvailable ? 'You are online and visible for requests.' : 'You are offline. Go online to receive requests.'}
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveSubTab('availability')}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${
                        courier?.isAvailable
                          ? 'bg-jade-100 text-jade-700 dark:bg-jade-500/15 dark:text-jade-300'
                          : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${courier?.isAvailable ? 'animate-pulse bg-jade-500' : 'bg-ink-400'}`} />
                      {courier?.isAvailable ? 'Online' : 'Offline'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                      { label: 'Open offers', value: String(myOfferedDeliveries.length), hint: 'Respond before expiry' },
                      { label: 'Active deliveries', value: String(myActiveDeliveries.length), hint: 'Assigned to you' },
                      { label: 'Completed', value: String(myHistoryDeliveries.filter((d) => d.status === 'DELIVERED').length), hint: 'Lifetime deliveries' },
                      { label: 'Pending earnings', value: `₦${Math.round(pendingEarnings).toLocaleString()}`, hint: 'Awaiting approval' },
                    ].map((card) => (
                      <div key={card.label} className="rounded-2xl border border-ink-150 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
                        <span className="block font-mono text-[10px] uppercase tracking-wider text-ink-400">{card.label}</span>
                        <span className="mt-1 block font-mono text-xl font-bold text-ink-900 dark:text-white">{card.value}</span>
                        <span className="text-[10px] text-ink-400">{card.hint}</span>
                      </div>
                    ))}
                  </div>

                  {myOfferedDeliveries.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">New assignment offers</h4>
                        <button onClick={() => setActiveSubTab('my_deliveries')} className="text-[11px] font-bold text-jade-700 dark:text-jade-300">View all</button>
                      </div>
                      {myOfferedDeliveries.slice(0, 2).map((delivery) => (
                        <RiderDeliveryCard key={delivery.id} delivery={delivery} rider={courier} compact onChanged={() => setDb(getDBState())} />
                      ))}
                    </div>
                  )}

                  {myActiveDeliveries.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Active delivery</h4>
                        <button onClick={() => setActiveSubTab('active_jobs')} className="text-[11px] font-bold text-jade-700 dark:text-jade-300">Open tracker</button>
                      </div>
                      {myActiveDeliveries.slice(0, 1).map((delivery) => (
                        <RiderDeliveryCard key={delivery.id} delivery={delivery} rider={courier} compact onChanged={() => setDb(getDBState())} />
                      ))}
                    </div>
                  )}

                  {myOfferedDeliveries.length === 0 && myActiveDeliveries.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/60 p-8 text-center dark:border-ink-700 dark:bg-ink-950/40">
                      <Truck className="mx-auto h-8 w-8 text-ink-300 dark:text-ink-600" />
                      <h4 className="mt-2 text-sm font-bold text-ink-800 dark:text-ink-200">No active deliveries</h4>
                      <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">Check available requests, or go online if you are currently offline.</p>
                      <div className="mt-3 flex flex-wrap justify-center gap-2">
                        <button onClick={() => setActiveSubTab('marketplace')} className="rounded-xl bg-jade-600 px-4 py-2 text-xs font-bold text-white hover:bg-jade-700">Browse requests</button>
                        <button onClick={() => setActiveSubTab('availability')} className="rounded-xl border border-ink-200 px-4 py-2 text-xs font-bold text-ink-600 dark:border-ink-700 dark:text-ink-300">Availability</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* AVAILABLE DELIVERIES */}
              {activeSubTab === 'marketplace' && (
                <RiderRequestsPanel
                  online={Boolean(courier?.isAvailable)}
                  onAccepted={() => setDb(getDBState())}
                />
              )}

              {/* MY DELIVERIES */}
              {activeSubTab === 'my_deliveries' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">My deliveries</h3>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      Assignment offers and accepted deliveries. Only packages assigned to you appear here.
                    </p>
                  </div>
                  {myOpenDeliveries.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-ink-200 p-8 text-center dark:border-ink-700">
                      <Truck className="mx-auto h-8 w-8 text-ink-300 dark:text-ink-600" />
                      <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">No assigned deliveries right now.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {myOpenDeliveries.map((delivery) => (
                        <RiderDeliveryCard key={delivery.id} delivery={delivery} rider={courier} onChanged={() => setDb(getDBState())} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* DELIVERY HISTORY */}
              {activeSubTab === 'history' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">Delivery history</h3>
                    <p className="text-xs text-ink-500 dark:text-ink-400">Completed and failed deliveries on your rider account.</p>
                  </div>
                  {myHistoryDeliveries.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-ink-200 p-8 text-center dark:border-ink-700">
                      <Clock className="mx-auto h-8 w-8 text-ink-300 dark:text-ink-600" />
                      <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">Your completed deliveries will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {myHistoryDeliveries.map((delivery) => (
                        <RiderDeliveryCard key={delivery.id} delivery={delivery} rider={courier} compact onChanged={() => setDb(getDBState())} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* PROFILE */}
              {activeSubTab === 'profile' && courier && <RiderProfilePanel rider={courier} />}

              {/* AVAILABILITY */}
              {activeSubTab === 'availability' && courier && (
                <RiderAvailabilityPanel rider={courier} onChanged={() => setDb(getDBState())} />
              )}

              {/* ACTIVE JOBS SUB-TAB */}
              {activeSubTab === 'active_jobs' && (
                <div className="space-y-6">
                  {myActiveDeliveries.length > 0 && (
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">Active delivery</h3>
                        <p className="text-xs text-ink-500 dark:text-ink-400">
                          Follow the steps in order. The buyer’s code is the only way to complete the delivery.
                        </p>
                      </div>
                      {myActiveDeliveries.map((delivery) => (
                        <RiderDeliveryCard
                          key={delivery.id}
                          delivery={delivery}
                          rider={courier}
                          onChanged={() => setDb(getDBState())}
                        />
                      ))}
                    </div>
                  )}
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
                            rider={mapLocation}
                            destination={activeDest}
                            pickup={activePickup}
                            speedKmh={currentSpeed}
                            statusLabel={
                              gpsBroadcasting
                                ? 'Broadcasting live GPS'
                                : activeJob.status === DeliveryJobStatus.ARRIVED
                                  ? 'Arrived at destination'
                                  : mapLocation
                                    ? 'Last real rider location'
                                    : 'Waiting for GPS'
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
                                    {gpsBroadcasting
                                      ? 'Your phone location is streaming to buyer and seller maps. Road ETA appears when Google Maps can calculate a route.'
                                      : 'Enable real GPS sharing and stay online to stream your position. Road ETA is unavailable until a reliable route is calculated.'}
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

                          {activeDelivery && activeDelivery.assignmentStatus === 'ACCEPTED' && (
                            <div className="bg-white dark:bg-ink-900 p-4 rounded-2xl border border-jade-500/20 space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <h4 className="text-xs font-bold tracking-wider font-mono text-ink-500">Delivery Confirmation</h4>
                                  <p className="text-[10px] text-ink-400 font-mono mt-0.5">{activeDelivery.deliveryNumber}</p>
                                </div>
                                <DeliveryStatusBadge status={activeDelivery.status} />
                              </div>

                              {!isDeliveryTerminal(activeDelivery.status) && (
                                <div className="flex flex-wrap gap-1.5">
                                  {nextDeliveryStatuses(activeDelivery, 'RIDER')
                                    .filter((status) => status !== 'FAILED_DELIVERY')
                                    .map((status) => (
                                      <button
                                        key={status}
                                        onClick={() => void advanceCanonicalDelivery(status)}
                                        className="px-2.5 py-1.5 rounded-lg bg-jade-500 hover:bg-jade-600 text-white text-[10px] font-bold cursor-pointer"
                                      >
                                        {deliveryStatusLabel(status)}
                                      </button>
                                    ))}
                                </div>
                              )}

                              {['OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED'].includes(activeDelivery.status) && (
                                <div className="space-y-2 pt-2 border-t border-ink-200 dark:border-ink-800">
                                  <label className="text-[10px] font-bold tracking-wider font-mono text-ink-500 block">
                                    Buyer&apos;s one-time confirmation code
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={deliveryCode}
                                    onChange={(e) => setDeliveryCode(e.target.value)}
                                    placeholder="6-digit code"
                                    maxLength={8}
                                    className="w-full text-center tracking-widest font-mono text-sm font-bold px-4 py-2.5 rounded-xl bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 focus:outline-none focus:ring-1 focus:ring-jade-500"
                                  />
                                  {deliveryCodeError && <p className="text-[10px] font-bold text-ink-500">{deliveryCodeError}</p>}
                                  <button
                                    onClick={() => void handleConfirmDeliveryCode()}
                                    disabled={deliveryBusy}
                                    className="w-full py-2.5 bg-jade-600 hover:bg-jade-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl cursor-pointer inline-flex items-center justify-center gap-1.5"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                    {deliveryBusy ? 'Confirming…' : 'Confirm delivery with code'}
                                  </button>
                                  <p className="text-[10px] text-ink-400">
                                    Only the assigned rider or a GoodSale operator can confirm. Escrow stays held until the buyer releases it.
                                  </p>
                                </div>
                              )}

                              {activeDelivery.status === 'DELIVERED' && (
                                <p className="text-[10px] font-bold text-jade-600 dark:text-jade-400 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Delivery confirmed
                                  {activeDelivery.confirmedAt ? ` · ${new Date(activeDelivery.confirmedAt).toLocaleString()}` : ''}
                                </p>
                              )}
                            </div>
                          )}

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
                                {mapLocation && liveGps.source === 'gps' && (
                                  <div className="font-mono text-xs opacity-90">Last GPS coordinates: {mapLocation.lat.toFixed(5)}°, {mapLocation.lng.toFixed(5)}°</div>
                                )}
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
                  ) : myActiveDeliveries.length === 0 ? (
                    <div className="text-center py-16">
                      <Compass className="w-14 h-14 text-ink-300 mx-auto mb-4" />
                      <h4 className="text-base font-bold text-ink-800 dark:text-white">No active deliveries</h4>
                      <p className="text-xs text-ink-500 dark:text-ink-400 max-w-sm mx-auto mt-1">
                        Accept a request from Available Deliveries to start a delivery.
                      </p>
                    </div>
                  ) : null}
                </div>
              )}

              {/* EARNINGS SUB-TAB */}
              {activeSubTab === 'earnings' && courier && (
                <div className="space-y-6">
                  <RiderEarningsPanel rider={courier} />

                  {/* Legacy dispatch job log */}
                  <div className="border-t border-ink-100 pt-5 dark:border-ink-800">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Legacy dispatch job earnings</h4>
                    <p className="mb-3 text-[11px] text-ink-400">Older GoodDispatch jobs recorded before rider earnings were introduced.</p>
                  </div>

                  {/* Earnings Overview stats cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-ink-50 dark:bg-ink-950 rounded-2xl p-5 border border-ink-100 dark:border-ink-800 space-y-1">
                      <span className="text-xs font-bold text-ink-400 tracking-wider font-mono">Legacy dispatch earnings</span>
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
                    <h4 className="text-xs font-bold tracking-wider font-mono text-ink-500">Legacy job log</h4>
                    {myCompletedJobs.length === 0 ? (
                      <p className="text-xs text-ink-400 italic text-center py-8">
                        No legacy dispatch jobs recorded on this account.
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
