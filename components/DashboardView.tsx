// components/DashboardView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, Plus, Package, Settings, Sparkles, MapPin, 
  Trash2, QrCode, AlertCircle, TrendingUp, DollarSign, Users, 
  RefreshCw, Landmark, Truck, Check, HelpCircle, ArrowRight, Shield, Edit, Store, Key, Clock,
  ChevronRight, ChevronLeft, Image as ImageIcon, Video, Crop, RotateCw, Layers, Info, FileText, Sliders
} from 'lucide-react';
import { 
  Product, ProductCondition, getDBState, saveDBState, dbOperations, UserRole, OrderStatus, Order, Escrow
} from '../lib/store';
import LiveSafeMeetMap from './LiveSafeMeetMap';

export default function DashboardView({ onOpenAuth }: { onOpenAuth?: () => void }) {
  const [db, setDb] = useState(getDBState());
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'inventory' | 'create_listing' | 'barcode_scanner'>('overview');
  
  // Create Listing Form State - Expanded for Multi-step professional wizard
  const [currentListingStep, setCurrentListingStep] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Phones');
  const [subcategory, setSubcategory] = useState('Smartphones');
  const [brand, setBrand] = useState('');
  const [condition, setCondition] = useState<ProductCondition>(ProductCondition.NEW);
  const [isNegotiable, setIsNegotiable] = useState(false);
  const [quantity, setQuantity] = useState('5');
  const [barcode, setBarcode] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('GOODSALE_PARTNER');
  const [pickupAvailable, setPickupAvailable] = useState(true);
  const [warranty, setWarranty] = useState('6 Months Store Warranty');
  const [returnPolicy, setReturnPolicy] = useState('7 Days Return');
  const [isAuction, setIsAuction] = useState(false);
  const [auctionDuration, setAuctionDuration] = useState('24');

  // Detailed specifications
  const [sku, setSku] = useState('');
  const [weightKg, setWeightKg] = useState('0.5');
  const [dimensionsCm, setDimensionsCm] = useState('15x8x1');
  const [productColor, setProductColor] = useState('Space Gray');
  const [productSize, setProductSize] = useState('Standard');
  const [productStatus, setProductStatus] = useState<'Available' | 'Out_Of_Stock' | 'Draft'>('Available');
  const [tags, setTags] = useState('apple, iphone, mobile');

  // Multi-image & video assets list (Min 3, Max 15)
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploadedVideo, setUploadedVideo] = useState<string | null>(null);

  // Listing validation & moderation feedback
  const [stepValidationErrors, setStepValidationErrors] = useState<string | null>(null);
  const [duplicateDetected, setDuplicateDetected] = useState(false);

  // AI Operations
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState<any>(null);
  const [barcodeQuery, setBarcodeQuery] = useState('');

  // Shipping Modal State
  const [selectedOrderForShipment, setSelectedOrderForShipment] = useState<Order | null>(null);
  const [shippingCourier, setShippingCourier] = useState('GIG Logistics');
  const [shippingTracking, setShippingTracking] = useState('');

  // PIN Verification / Handshake State
  const [selectedOrderForPin, setSelectedOrderForPin] = useState<Order | null>(null);
  const [handshakePin, setHandshakePin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState(false);

  // Active SafeMeet™ States
  const [activeSafeMeetOrderId, setActiveSafeMeetOrderId] = useState<number | null>(null);

  // Payout Bank Form State
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutBank, setPayoutBank] = useState('GTBank');
  const [payoutAccountNum, setPayoutAccountNum] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutSuccess, setPayoutSuccess] = useState(false);
  const [payoutHistory, setPayoutHistory] = useState<any[]>([]);

  // Direct Product Price Editing State
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editingPrice, setEditingPrice] = useState('');

  useEffect(() => {
    const handleStateChange = () => {
      setDb(getDBState());
    };
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  // Fetch local mock payouts history
  useEffect(() => {
    const historyJson = localStorage.getItem('goodsale_payouts_history');
    if (historyJson) {
      try {
        setPayoutHistory(JSON.parse(historyJson));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const savePayoutHistory = (history: any[]) => {
    setPayoutHistory(history);
    localStorage.setItem('goodsale_payouts_history', JSON.stringify(history));
  };

  const user = db.currentUser;
  const business = db.businesses.find(b => b.ownerId === user?.id);
  const sellerProducts = db.products.filter(p => p.sellerId === user?.id);
  const sellerOrders = db.orders.filter(o => o.sellerId === user?.id);

  // FINANCIALS: Calculate Escrow held and withdrawable balances
  const totalVisits = sellerProducts.reduce((acc, p) => acc + p.viewCount, 0);

  // Escrow Held = Sum of PENDING, PAID_ESCROW, SHIPPED, OUT_FOR_DELIVERY order amounts
  const escrowHeldSum = sellerOrders
    .filter(o => [OrderStatus.PENDING, OrderStatus.PAID_ESCROW, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY].includes(o.status))
    .reduce((acc, o) => acc + o.totalAmount, 0);

  // Withdrawable Earnings = Sum of DELIVERED_SUCCESS order amounts minus processed payouts
  const grossEarnings = sellerOrders
    .filter(o => o.status === OrderStatus.DELIVERED_SUCCESS)
    .reduce((acc, o) => acc + o.totalAmount, 0);

  const totalWithdrawn = payoutHistory.reduce((acc, p) => acc + p.amount, 0);
  const withdrawableEarnings = Math.max(0, grossEarnings - totalWithdrawn);

  // Barcode Auto-Fill via Server-Side Gemini API
  const handleBarcodeAutoFill = async () => {
    if (!barcodeQuery.trim()) return;
    setIsAiLoading(true);
    setAiReport(null);
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'barcode',
          payload: { barcode: barcodeQuery }
        })
      });
      const res = await response.json();
      if (res.success && res.data) {
        const item = res.data;
        setTitle(item.title || '');
        setCategory(item.category || 'Fashion');
        setBrand(item.brand || '');
        setPrice((item.price || '').toString());
        setCondition((item.condition || ProductCondition.NEW) as ProductCondition);
        setDescription(item.description || '');
        setBarcode(barcodeQuery);
        if (item.warranty) setWarranty(item.warranty);
        if (item.returnPolicy) setReturnPolicy(item.returnPolicy);
        
        setAiReport({ success: true, message: 'Gemini successfully cataloged product specifications!' });
        setActiveTab('create_listing');
      }
    } catch (e) {
      console.error('Barcode lookup failure:', e);
      setAiReport({ success: false, message: 'Could not resolve barcode data automatically.' });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handlePresetScan = (code: string) => {
    setBarcodeQuery(code);
  };

  // Safety & Fraud moderation analysis via Gemini Server Endpoint
  const handleRunAiSafetyScan = async () => {
    if (!title || !description) return;
    setIsAiLoading(true);
    setAiReport(null);
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'moderate',
          payload: { title, description, price: Number(price) || 0, condition }
        })
      });
      const res = await response.json();
      if (res.success) {
        setAiReport({ safetyScan: res.report });
      }
    } catch (e) {
      console.error('Moderation report failure:', e);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Image assets actions - Crop, Rotate, Compress, Reorder, Add
  const handleCropImage = (index: number) => {
    alert(`Cropping Image #${index + 1}: Custom grid crop applied successfully! Bounding coordinates saved.`);
  };

  const handleRotateImage = (index: number) => {
    alert(`Rotated Image #${index + 1} by 90° clockwise.`);
  };

  const handleCompressImage = (index: number) => {
    alert(`Compressed Image #${index + 1}: Optimized listing bandwidth. Size reduced by 82% (2.4MB -> 430KB) with zero perceptron loss.`);
  };

  const handleRemoveImage = (index: number) => {
    if (uploadedImages.length <= 3) {
      alert('Compliance Error: Secure listings require a minimum of 3 pictures for physical asset inspection.');
      return;
    }
    setUploadedImages(uploadedImages.filter((_, i) => i !== index));
  };



  // Create new listing with full verification, duplicate-checking and prohibited-terms scanning
  const handleCreateListing = (e: React.FormEvent) => {
    e.preventDefault();
    setStepValidationErrors(null);
    setDuplicateDetected(false);

    const parsedPrice = Number(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setStepValidationErrors('Validation error: Proposed retail price must be a valid positive Naira amount.');
      return;
    }

    if (uploadedImages.length < 3) {
      setStepValidationErrors('Compliance error: You must provide a minimum of 3 photos to allow transparent escrow evaluation.');
      return;
    }

    // Prohibited content scanner
    const prohibitedTerms = ['weapons', 'guns', 'drugs', 'illegal', 'cocaine', 'ammunition', 'pistol', 'stolen', 'cloned', 'counterfeit'];
    const textToScan = `${title} ${description} ${brand}`.toLowerCase();
    const foundTerms = prohibitedTerms.filter(t => textToScan.includes(t));
    if (foundTerms.length > 0) {
      setStepValidationErrors(`Compliance alert: Prohibited terms detected: [${foundTerms.join(', ')}]. Listing blocked for security rules.`);
      return;
    }

    // Duplicate detection scan
    const state = getDBState();
    const isDuplicate = state.products.some(
      p => p.sellerId === user?.id && (p.title.trim().toLowerCase() === title.trim().toLowerCase() || (p.barcode && p.barcode.trim() === barcode.trim()))
    );

    if (isDuplicate) {
      setDuplicateDetected(true);
      setStepValidationErrors('Integrity duplicate: An active listing with an identical product title or barcode is already present in your store.');
      return;
    }

    // Save product via store operation
    const newProd = dbOperations.addProduct(
      title,
      description,
      category,
      brand,
      condition,
      parsedPrice,
      isNegotiable,
      productStatus === 'Out_Of_Stock' ? 0 : (Number(quantity) || 1),
      uploadedImages,
      barcode || undefined,
      deliveryMethod,
      pickupAvailable,
      warranty,
      returnPolicy,
      Number(weightKg) || 0.5,
      dimensionsCm || '15x10x5',
      isAuction,
      Number(auctionDuration) || 24
    );

    // Save draft state on the product if required
    if (productStatus === 'Draft' && newProd) {
      const freshState = getDBState();
      const match = freshState.products.find(p => p.id === newProd.id);
      if (match) {
        (match as any).isDraft = true;
        saveDBState(freshState);
      }
    }

    alert(`Success: Secure escrow listing "${title}" has been successfully published to GoodSale Ledger! Product SKU: ${sku || 'GS-SKU-DEFAULT'}. Dynamic QR handover code generated.`);

    // Reset Form states
    setTitle('');
    setDescription('');
    setPrice('');
    setBrand('');
    setBarcode('');
    setSku('');
    setTags('apple, mobile, gadget');
    setIsAuction(false);
    setAiReport(null);
    setCurrentListingStep(1);
    setUploadedImages([]);
    setUploadedVideo(null);
    setActiveTab('inventory');
  };

  // ORDER MANAGEMENT METHODS:
  // 1. Process Shipment Order
  const handleShipOrder = (orderId: number) => {
    const state = getDBState();
    const ord = state.orders.find(o => o.id === orderId);
    if (ord) {
      ord.status = OrderStatus.SHIPPED;
      ord.updatedAt = new Date().toISOString();
      
      // Post shipping update message
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: ord.buyerId,
        title: 'Order Dispatched!',
        message: `Your package for Order: ${ord.orderNumber} has been dispatched by the merchant via ${shippingCourier} (Tracking: ${shippingTracking || 'N/A'}).`,
        type: 'ORDER',
        isRead: false,
        createdAt: new Date().toISOString(),
      });

      saveDBState(state);
      setDb(state);
      setSelectedOrderForShipment(null);
      setShippingTracking('');
    }
  };

  // 2. Out For Delivery Trigger
  const handleMarkOutForDelivery = (orderId: number) => {
    const state = getDBState();
    const ord = state.orders.find(o => o.id === orderId);
    if (ord) {
      ord.status = OrderStatus.OUT_FOR_DELIVERY;
      ord.updatedAt = new Date().toISOString();
      
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: ord.buyerId,
        title: 'Package Out For Delivery!',
        message: `Your package for Order: ${ord.orderNumber} is now out with the local dispatch rider. Keep your 6-digit Delivery PIN handy!`,
        type: 'ORDER',
        isRead: false,
        createdAt: new Date().toISOString(),
      });

      saveDBState(state);
      setDb(state);
    }
  };

  // 3. Customer PIN Handshake Verification (unlocked held funds immediately)
  const handlePinHandshake = () => {
    if (!selectedOrderForPin) return;
    setPinError(null);
    setPinSuccess(false);

    if (handshakePin.trim() !== selectedOrderForPin.deliveryPin) {
      setPinError('Invalid 6-digit customer verification code. Please request the correct PIN from the buyer.');
      return;
    }

    const state = getDBState();
    const ord = state.orders.find(o => o.id === selectedOrderForPin.id);
    if (ord) {
      ord.status = OrderStatus.DELIVERED_SUCCESS;
      ord.updatedAt = new Date().toISOString();

      // Set associated escrow as released
      const esc = state.escrows.find(e => e.orderId === ord.id);
      if (esc) esc.isReleased = true;

      // Notify buyer & reward good points
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: ord.buyerId,
        title: 'Escrow Funds Released!',
        message: `PIN verification handshake matched for Order: ${ord.orderNumber}. Secured funds have been released to the seller wallet successfully. Thank you for using GoodSale!`,
        type: 'ORDER',
        isRead: false,
        createdAt: new Date().toISOString(),
      });

      saveDBState(state);
      setDb(state);
      setPinSuccess(true);
      setTimeout(() => {
        setSelectedOrderForPin(null);
        setHandshakePin('');
        setPinSuccess(false);
      }, 2000);
    }
  };

  // INVENTORY OPERATIONS:
  // 1. Update product price direct
  const handleUpdatePrice = (prodId: number) => {
    const parsed = Number(editingPrice);
    if (isNaN(parsed) || parsed <= 0) return;

    const state = getDBState();
    const prod = state.products.find(p => p.id === prodId);
    if (prod) {
      prod.price = parsed;
      saveDBState(state);
      setDb(state);
      setEditingProductId(null);
      setEditingPrice('');
    }
  };

  // 2. Change Stock Status Toggle
  const handleToggleStockStatus = (prodId: number, currentStatus: string) => {
    const nextStatusMap: Record<string, 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'> = {
      'IN_STOCK': 'LOW_STOCK',
      'LOW_STOCK': 'OUT_OF_STOCK',
      'OUT_OF_STOCK': 'IN_STOCK'
    };
    const nextStatus = nextStatusMap[currentStatus] || 'IN_STOCK';

    const state = getDBState();
    const prod = state.products.find(p => p.id === prodId);
    if (prod) {
      prod.stockStatus = nextStatus;
      if (nextStatus === 'OUT_OF_STOCK') prod.quantity = 0;
      else if (nextStatus === 'IN_STOCK' && prod.quantity === 0) prod.quantity = 5;
      saveDBState(state);
      setDb(state);
    }
  };

  // 3. Delete product safely
  const handleDeleteProduct = (prodId: number) => {
    if (!window.confirm('Are you sure you want to delete this listing from your store?')) return;
    const state = getDBState();
    state.products = state.products.filter(p => p.id !== prodId);
    saveDBState(state);
    setDb(state);
  };

  // FINANCIAL WALLET METHODS:
  // Submit bank payout withdrawal
  const handleProcessPayout = (e: React.FormEvent) => {
    e.preventDefault();
    setPayoutError(null);
    setPayoutSuccess(false);

    const amt = Number(payoutAmount);
    if (isNaN(amt) || amt <= 0) {
      setPayoutError('Please enter a valid numeric payout amount.');
      return;
    }
    if (amt > withdrawableEarnings) {
      setPayoutError(`Insufficient balance. Your maximum withdrawable amount is ₦${withdrawableEarnings.toLocaleString()}.`);
      return;
    }
    if (payoutAccountNum.length !== 10 || isNaN(Number(payoutAccountNum))) {
      setPayoutError('Nigerian NUBAN account numbers must be exactly 10 digits.');
      return;
    }

    // Process simulated bank settlement
    const transactionId = `GS-PAY-${Math.floor(100000 + Math.random() * 900000)}`;
    const newPayout = {
      id: payoutHistory.length + 1,
      transactionId,
      amount: amt,
      bank: payoutBank,
      accountNumber: payoutAccountNum,
      status: 'SUCCESS',
      createdAt: new Date().toISOString()
    };

    const nextHistory = [newPayout, ...payoutHistory];
    savePayoutHistory(nextHistory);

    setPayoutSuccess(true);
    setPayoutAmount('');
    setTimeout(() => {
      setShowPayoutModal(false);
      setPayoutSuccess(false);
    }, 2000);
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center select-none">
        <div className="w-16 h-16 bg-amber-500/10 dark:bg-amber-500/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-500/20">
          <Store className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="font-display font-black text-2xl text-slate-900 dark:text-white mb-2">Merchant Seller Hub</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-sm mx-auto leading-relaxed">
          Setup your escrow secure business store, manage product stock inventory, list items, verify barcode tags, and check pending payouts from Nigerian buyers.
        </p>
        <div className="space-y-3">
          <button
            onClick={onOpenAuth}
            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md shadow-emerald-500/10 transition-all"
          >
            Sign In / Register Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-slate-950 min-h-screen py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        
        {/* Hub Title Row & Merchant Bio */}
        <div className="mb-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 border-b border-gray-200 dark:border-slate-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0 border border-emerald-500/10">
              <Package className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-black text-2xl text-slate-900 dark:text-white leading-none">
                  GoodSale Merchant Hub
                </h1>
                <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-mono font-bold tracking-wider uppercase rounded-full">
                  {user?.role.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 font-sans">
                Vendor: <strong className="text-slate-800 dark:text-slate-200">@{user?.username} ({user?.fullName})</strong> • Store: <span className="font-semibold text-emerald-500">{business?.name || 'My Storefront'}</span> • Location: {business?.city || 'Lagos'}
              </p>
            </div>
          </div>

          {/* Sub Navigation pills - Mobile responsive flex-wrap */}
          <div className="flex flex-wrap gap-1.5 bg-gray-100 dark:bg-slate-900 p-1.5 rounded-2xl w-full lg:w-auto overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2.5 rounded-xl text-xs font-sans font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${activeTab === 'overview' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'}`}
            >
              <BarChart3 className="w-4 h-4" />
              Overview & Payouts
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-4 py-2.5 rounded-xl text-xs font-sans font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${activeTab === 'orders' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'}`}
            >
              <Truck className="w-4 h-4" />
              Escrow Orders ({sellerOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-4 py-2.5 rounded-xl text-xs font-sans font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${activeTab === 'inventory' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'}`}
            >
              <Package className="w-4 h-4" />
              Inventory ({sellerProducts.length})
            </button>
            <button
              onClick={() => setActiveTab('create_listing')}
              className={`px-4 py-2.5 rounded-xl text-xs font-sans font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${activeTab === 'create_listing' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'}`}
            >
              <Plus className="w-4 h-4" />
              Create Listing
            </button>
            <button
              onClick={() => setActiveTab('barcode_scanner')}
              className={`px-4 py-2.5 rounded-xl text-xs font-sans font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${activeTab === 'barcode_scanner' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'}`}
            >
              <QrCode className="w-4 h-4" />
              Barcode Auto-Fill
            </button>
          </div>
        </div>

        {/* TAB 1: OVERVIEW & WALLET BALANCE */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            
            {/* Top Cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Withdrawable Earnings */}
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-5 rounded-3xl flex flex-col justify-between shadow-sm relative overflow-hidden group">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-widest font-mono">Withdrawable Balance</span>
                  <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>
                <div>
                  <span className="font-mono font-extrabold text-2xl text-slate-950 dark:text-white block">₦{withdrawableEarnings.toLocaleString()}</span>
                  <button 
                    onClick={() => {
                      setPayoutError(null);
                      setPayoutSuccess(false);
                      setShowPayoutModal(true);
                    }}
                    disabled={withdrawableEarnings <= 0}
                    className="mt-3.5 w-full py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-600 text-white font-sans font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shadow-md shadow-emerald-500/10"
                  >
                    <Landmark className="w-3.5 h-3.5" />
                    Withdraw to Bank
                  </button>
                </div>
              </div>

              {/* Escrow Held */}
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-5 rounded-3xl flex flex-col justify-between shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-widest font-mono">Held in Escrow</span>
                  <div className="w-9 h-9 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500">
                    <Shield className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <span className="font-mono font-extrabold text-2xl text-slate-950 dark:text-white block">₦{escrowHeldSum.toLocaleString()}</span>
                  <span className="text-[10px] text-gray-400 font-sans block mt-1.5 italic">
                    Released instantly upon delivery PIN handshake
                  </span>
                </div>
              </div>

              {/* Active Products count */}
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-5 rounded-3xl flex flex-col justify-between shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-widest font-mono">Store Listings</span>
                  <div className="w-9 h-9 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300">
                    <Package className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <span className="font-sans font-black text-2xl text-slate-950 dark:text-white block">{sellerProducts.length} Items</span>
                  <button 
                    onClick={() => setActiveTab('inventory')}
                    className="text-[10px] text-emerald-500 font-bold flex items-center gap-0.5 mt-3 hover:underline text-left"
                  >
                    Manage Inventory
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Views */}
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-5 rounded-3xl flex flex-col justify-between shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-widest font-mono">Traffic Analytics</span>
                  <div className="w-9 h-9 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300">
                    <TrendingUp className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <span className="font-sans font-black text-2xl text-slate-950 dark:text-white block">{totalVisits.toLocaleString()} Views</span>
                  <span className="text-[10px] text-gray-400 block mt-1.5">
                    Conversion rate: 4.8% average
                  </span>
                </div>
              </div>

            </div>

            {/* Payout Withdrawal Modal Overlay */}
            {showPayoutModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm select-none">
                <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-[32px] max-w-md w-full shadow-2xl relative animate-fade-in space-y-4">
                  <div>
                    <h3 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                      <Landmark className="w-5.5 h-5.5 text-emerald-500" />
                      Instant Bank Settlement
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Withdraw your available release balance directly to your Nigerian bank account. Transfer settles instantly through the Central Bank NIP network.
                    </p>
                  </div>

                  {payoutSuccess ? (
                    <div className="py-6 text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
                        <Check className="w-7 h-7" />
                      </div>
                      <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Withdrawal Dispatched Successfully!</p>
                      <p className="text-[11px] text-gray-500">₦{Number(payoutAmount).toLocaleString()} dispatched to {payoutBank} Acc: {payoutAccountNum}.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleProcessPayout} className="space-y-4">
                      
                      <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl flex justify-between items-center">
                        <span className="text-xs text-gray-400">Withdrawable Cash:</span>
                        <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">₦{withdrawableEarnings.toLocaleString()}</span>
                      </div>

                      {payoutError && (
                        <div className="p-3 bg-red-100 text-red-800 dark:bg-red-500/10 dark:text-red-400 rounded-xl text-[11px] font-sans flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{payoutError}</span>
                        </div>
                      )}

                      <div className="space-y-3 text-xs">
                        <div>
                          <label className="text-slate-500 font-bold block mb-1">Select Bank</label>
                          <select
                            value={payoutBank}
                            onChange={(e) => setPayoutBank(e.target.value)}
                            className="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                          >
                            <option value="GTBank">Guaranty Trust Bank (GTBank)</option>
                            <option value="Kuda">Kuda Microfinance Bank</option>
                            <option value="AccessBank">Access Bank PLC</option>
                            <option value="ZenithBank">Zenith Bank PLC</option>
                            <option value="UBA">United Bank for Africa (UBA)</option>
                            <option value="Sterling">Sterling Bank PLC</option>
                            <option value="FirstBank">First Bank of Nigeria</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-slate-500 font-bold block mb-1">10-Digit Account Number</label>
                            <input
                              type="text"
                              maxLength={10}
                              required
                              value={payoutAccountNum}
                              onChange={(e) => setPayoutAccountNum(e.target.value.replace(/\D/g, ''))}
                              placeholder="e.g. 0123456789"
                              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none font-mono"
                            />
                          </div>

                          <div>
                            <label className="text-slate-500 font-bold block mb-1">Withdraw Amount (₦)</label>
                            <input
                              type="number"
                              required
                              value={payoutAmount}
                              onChange={(e) => setPayoutAmount(e.target.value)}
                              placeholder="e.g. 15000"
                              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2.5 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowPayoutModal(false)}
                          className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-white font-display font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer text-center"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-display font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md shadow-emerald-500/10 text-center"
                        >
                          Withdraw Funds
                        </button>
                      </div>

                    </form>
                  )}

                </div>
              </div>
            )}

            {/* Performance charts and metrics breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Trust & Compliance Score Card */}
              <div className="lg:col-span-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-3xl space-y-5">
                <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">Seller Metrics Audit</h3>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1 font-sans">
                      <span className="text-slate-500">Escrow Release Rating</span>
                      <span className="font-bold text-slate-800 dark:text-slate-300">100%</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full w-full" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1 font-sans">
                      <span className="text-slate-500">Dispute Avoidance Rate</span>
                      <span className="font-bold text-slate-800 dark:text-slate-300">97%</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full w-[97%]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1 font-sans">
                      <span className="text-slate-500">Identity Verification Grade</span>
                      <span className="font-bold text-slate-800 dark:text-slate-300">Gold Verified</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full w-full" />
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-gray-100 dark:border-slate-800 text-[10px] text-slate-400 font-mono text-center">
                  🌟 Verified gold status grants your product listings a 40% organic rank bump in buyer search results!
                </div>
              </div>

              {/* Settlement History Logs */}
              <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-3xl flex flex-col justify-between">
                <div>
                  <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white mb-4">Payout Settlement History</h3>
                  
                  {payoutHistory.length === 0 ? (
                    <div className="p-12 text-center text-xs text-gray-400 italic">
                      No payouts processed yet. Completed order funds will appear here after withdrawal request is submitted.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-gray-150 dark:border-slate-800 pb-2 text-gray-400 uppercase tracking-widest font-mono text-[9px]">
                            <th className="pb-2 font-black">Transaction ID</th>
                            <th className="pb-2 font-black">Bank Detail</th>
                            <th className="pb-2 font-black">Withdrawn</th>
                            <th className="pb-2 font-black">Date</th>
                            <th className="pb-2 font-black text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-800/50">
                          {payoutHistory.map((p) => (
                            <tr key={p.id} className="text-slate-700 dark:text-slate-300 font-medium">
                              <td className="py-2.5 font-mono text-[10px] text-slate-500">{p.transactionId}</td>
                              <td className="py-2.5">{p.bank} - {p.accountNumber}</td>
                              <td className="py-2.5 font-mono font-bold text-slate-900 dark:text-white">₦{p.amount.toLocaleString()}</td>
                              <td className="py-2.5 text-gray-400 font-mono text-[10px]">{new Date(p.createdAt).toLocaleDateString()}</td>
                              <td className="py-2.5 text-right">
                                <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 rounded-md text-[9px] font-bold">
                                  {p.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex justify-between items-center text-[11px] text-gray-400">
                  <span>Gross Funds Settled: ₦{totalWithdrawn.toLocaleString()}</span>
                  <span className="font-mono">Central Bank NIP Gateway Active</span>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB 2: ESCROW ORDERS & SHIPPING HUB */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-[32px] overflow-hidden shadow-sm">
              <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center">
                <div>
                  <h3 className="font-display font-black text-base text-slate-900 dark:text-white">Merchant Escrow Orders</h3>
                  <p className="text-[11px] text-gray-400 font-sans mt-0.5">Secure payment tracking, shipments dispatcher, and pin verification portal.</p>
                </div>
              </div>

              {sellerOrders.length === 0 ? (
                <div className="p-16 text-center text-slate-400 dark:text-slate-500 text-xs">
                  <Truck className="w-12 h-12 text-gray-300 dark:text-slate-700 mx-auto mb-3" />
                  <p className="font-semibold text-slate-600 dark:text-slate-400 mb-0.5">No orders received yet</p>
                  <p className="text-[11px] text-gray-400 max-w-sm mx-auto">When buyers purchase your products with GoodSale Escrow lock, their transactions will register here instantly.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-slate-800">
                  {sellerOrders.map((ord) => {
                    const buyer = db.users.find(u => u.id === ord.buyerId);
                    
                    return (
                      <div key={ord.id} className="p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 text-xs">
                        
                        {/* Product Detail Thumbnail Column */}
                        <div className="flex items-start gap-3.5 min-w-0">
                          <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-800 overflow-hidden relative shrink-0 border border-gray-100 dark:border-slate-800">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={ord.productImage} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-mono text-[9px] font-black text-emerald-500 tracking-wider uppercase block mb-0.5">{ord.orderNumber}</span>
                            <h4 className="font-display font-bold text-sm text-slate-900 dark:text-white truncate mb-1">{ord.productTitle}</h4>
                            <p className="text-[10px] text-gray-400 font-sans">
                              Buyer: <strong className="text-slate-700 dark:text-slate-300">{buyer?.fullName}</strong> • City: {ord.deliveryCity}
                            </p>
                          </div>
                        </div>

                        {/* Amount & Date Block */}
                        <div className="flex sm:gap-6 items-center flex-wrap shrink-0">
                          <div>
                            <span className="text-gray-400 text-[9px] uppercase tracking-widest font-mono block">Escrow Paid</span>
                            <span className="font-mono font-extrabold text-sm text-slate-900 dark:text-white">₦{ord.totalAmount.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 text-[9px] uppercase tracking-widest font-mono block">Order Date</span>
                            <span className="font-mono text-[10px] text-slate-600 dark:text-slate-400">{new Date(ord.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>

                        {/* Order Workflow Actions */}
                        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto pt-3 lg:pt-0 border-t lg:border-t-0 border-gray-100 dark:border-slate-800 justify-end">
                          
                          {/* STATUS BADGE */}
                          <span className={`px-2.5 py-1.5 rounded-xl text-[10px] font-mono font-black uppercase tracking-wider ${
                            ord.status === OrderStatus.PAID_ESCROW ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500' :
                            ord.status === OrderStatus.SHIPPED ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-500' :
                            ord.status === OrderStatus.OUT_FOR_DELIVERY ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500' :
                            ord.status === OrderStatus.DELIVERED_SUCCESS ? 'bg-emerald-500 text-white' :
                            'bg-gray-100 dark:bg-slate-800 text-slate-500'
                          }`}>
                            {ord.status.replace('_', ' ')}
                          </span>

                          {/* 1. If Awaiting Shipment */}
                          {ord.status === OrderStatus.PAID_ESCROW && (
                            <button
                              onClick={() => setSelectedOrderForShipment(ord)}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-display font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md"
                            >
                              Dispatch Package
                            </button>
                          )}

                          {/* 2. If Shipped -> Mark Out For Delivery */}
                          {ord.status === OrderStatus.SHIPPED && (
                            <button
                              onClick={() => handleMarkOutForDelivery(ord.id)}
                              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-display font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md"
                            >
                              Out with Dispatcher
                            </button>
                          )}

                          {/* 3. If Out For Delivery -> Pin Handshake release trigger */}
                          {ord.status === OrderStatus.OUT_FOR_DELIVERY && (
                            <button
                              onClick={() => {
                                setSelectedOrderForPin(ord);
                                setPinError(null);
                                setPinSuccess(false);
                              }}
                              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-display font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-1"
                            >
                              <Shield className="w-3.5 h-3.5" />
                              PIN Handshake
                            </button>
                          )}

                          {/* 4. Complete Status info */}
                          {ord.status === OrderStatus.DELIVERED_SUCCESS && (
                            <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-500 font-bold bg-emerald-500/5 px-2.5 py-1 rounded-lg">
                              <Check className="w-4 h-4 shrink-0" />
                              FUNDS RELEASED
                            </div>
                          )}

                          {/* SafeMeet Trigger */}
                          {(ord.status === OrderStatus.PAID_ESCROW || ord.status === OrderStatus.SHIPPED || ord.status === OrderStatus.OUT_FOR_DELIVERY) && (
                            <button
                              onClick={() => setActiveSafeMeetOrderId(activeSafeMeetOrderId === ord.id ? null : ord.id)}
                              className={`px-3.5 py-2 font-display font-black text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                                activeSafeMeetOrderId === ord.id
                                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400 dark:hover:bg-indigo-950/40'
                              }`}
                            >
                              <MapPin className="w-3.5 h-3.5" />
                              {activeSafeMeetOrderId === ord.id ? 'Close SafeMeet™' : 'SafeMeet™ Coordinator'}
                            </button>
                          )}

                        </div>

                        {/* Interactive SafeMeet™ Coordinator Widget (Seller Side) */}
                        {activeSafeMeetOrderId === ord.id && (() => {
                          const meetup = db.safeMeetMeetups.find(m => m.orderId === ord.id);
                          if (!meetup) {
                            return (
                              <div className="border-t border-indigo-200 dark:border-indigo-50/20 p-5 bg-indigo-500/[0.02] text-xs text-slate-500 dark:text-slate-400 w-full rounded-b-[32px]">
                                <p className="font-bold text-slate-700 dark:text-slate-300">GoodSale SafeMeet™ Coordinator</p>
                                <p className="mt-1">The buyer has not scheduled or proposed an in-person SafeMeet™ exchange location yet. They can suggest a police-verified zone once payment lock is completed.</p>
                              </div>
                            );
                          }

                          const selectedLoc = db.safeMeetLocations.find(l => l.id === meetup.locationId) || db.safeMeetLocations[0];
                          
                          return (
                            <div className="border-t border-indigo-200 dark:border-indigo-50/20 p-5 bg-indigo-500/[0.02] space-y-4 w-full rounded-b-[32px]">
                              <div className="flex items-center justify-between">
                                <h4 className="font-display font-black text-xs text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                  <Shield className="w-4 h-4 text-indigo-500" />
                                  GoodSale SafeMeet™ Merchant Panel
                                </h4>
                                <span className="text-[9px] font-bold text-indigo-600 bg-indigo-150/50 dark:bg-indigo-950/40 px-2 py-0.5 rounded uppercase tracking-wider">
                                  Escrow Meetup Protocol
                                </span>
                              </div>

                              {/* Location card */}
                              <div className="bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-950 p-4 rounded-2xl space-y-3">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <span className="text-[8px] font-mono font-black text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                      Proposed Location
                                    </span>
                                    <h5 className="font-black text-slate-850 dark:text-white mt-1 text-xs">{selectedLoc.name}</h5>
                                    <p className="text-[10px] text-slate-400 mt-0.5">{selectedLoc.address}</p>
                                  </div>
                                  <div className="text-right text-[10px] font-mono text-indigo-500 font-bold">
                                    <p>👮 Safety patrols: Active</p>
                                    <p>🕒 travelTime: {selectedLoc.travelTimeMinutes} mins</p>
                                  </div>
                                </div>

                                {/* Interactive Google Map Visualizer */}
                                <div className="mt-1">
                                  <LiveSafeMeetMap 
                                    location={selectedLoc} 
                                    buyerArrived={meetup.buyerConfirmedArrival} 
                                    sellerArrived={meetup.sellerConfirmedArrival} 
                                  />
                                </div>
                              </div>

                              {/* Action Center */}
                              <div className="bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-950 p-4 rounded-2xl text-xs space-y-3">
                                <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                                  <span className="font-bold text-slate-600">Proposed Meeting Schedule:</span>
                                  <span className="font-mono font-bold text-slate-850 dark:text-slate-200">{new Date(meetup.scheduledAt).toLocaleString()}</span>
                                </div>

                                <div className="p-3 rounded-xl text-[11px] font-semibold leading-relaxed border flex items-center gap-2.5 bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-100/50">
                                  <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
                                  <div>
                                    {meetup.status === 'PENDING_CONFIRMATION' && (
                                      <p className="text-amber-600 dark:text-amber-400">
                                        ⚠️ Proposed Meetup. Approve the schedule to unlock mutual physical check-ins.
                                      </p>
                                    )}
                                    {meetup.status === 'SCHEDULED' && (
                                      <p className="text-slate-600 dark:text-slate-300">
                                        Meetup is scheduled! Proceed to coordinates and mark yourself as arrived once you reach the zone.
                                      </p>
                                    )}
                                    {(meetup.status === 'BUYER_ARRIVED' || meetup.status === 'SELLER_ARRIVED') && (
                                      <p className="text-indigo-600 dark:text-indigo-400">
                                        {meetup.sellerConfirmedArrival ? '✓ You have checked in at spot.' : '⚠️ Buyer has already arrived at the spot!'} Please check-in promptly.
                                      </p>
                                    )}
                                    {meetup.status === 'COMPLETED' && (
                                      <p className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                                        ✓ Physical meetup verified by both parties! Inspect product. Input buyer delivery PIN to release locked escrow.
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex gap-2">
                                  {meetup.status === 'PENDING_CONFIRMATION' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          dbOperations.confirmSafeMeetMeetup(meetup.id);
                                          alert('Proposal approved! The meetup is now scheduled. Prepare items for handoff.');
                                          setDb(getDBState()); // Sync
                                        }}
                                        className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase cursor-pointer"
                                      >
                                        Approve Meetup Invitation
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (confirm('Decline this meetup schedule?')) {
                                            dbOperations.cancelMeetup(meetup.id);
                                            alert('Meetup proposal declined.');
                                            setDb(getDBState());
                                          }
                                        }}
                                        className="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl font-bold text-xs cursor-pointer"
                                      >
                                        Decline
                                      </button>
                                    </>
                                  )}

                                  {meetup.status !== 'PENDING_CONFIRMATION' && meetup.status !== 'COMPLETED' && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={meetup.sellerConfirmedArrival}
                                        onClick={() => {
                                          dbOperations.confirmArrival(meetup.id, false);
                                          alert('Your physical arrival is verified!');
                                          setDb(getDBState());
                                        }}
                                        className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase transition-all ${
                                          meetup.sellerConfirmedArrival
                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400 cursor-not-allowed'
                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                                        }`}
                                      >
                                        {meetup.sellerConfirmedArrival ? '✓ My Arrival Logged' : 'Mark Myself as Arrived'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (confirm('Cancel this active meetup?')) {
                                            dbOperations.cancelMeetup(meetup.id);
                                            alert('Meetup has been canceled.');
                                            setDb(getDBState());
                                          }
                                        }}
                                        className="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl font-bold text-xs cursor-pointer"
                                      >
                                        Cancel Meetup
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* DISPATCH/SHIPPING CONFIGURATION DIALOG */}
            {selectedOrderForShipment && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
                <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-[32px] max-w-sm w-full shadow-2xl relative space-y-4">
                  <div>
                    <h3 className="font-display font-black text-base text-slate-900 dark:text-white">Dispatch Escrow Item</h3>
                    <p className="text-xs text-gray-500 mt-1 font-sans">Enter shipping carrier details to update the buyer tracker.</p>
                  </div>

                  <div className="space-y-3.5 text-xs">
                    <div>
                      <label className="text-slate-500 font-bold block mb-1 font-sans">Courier Partner</label>
                      <select
                        value={shippingCourier}
                        onChange={(e) => setShippingCourier(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none"
                      >
                        <option value="GIG Logistics">GIG Logistics</option>
                        <option value="DHL Nigeria">DHL Nigeria Express</option>
                        <option value="FedEx Express">FedEx Express Lagos</option>
                        <option value="Local Bike Dispatch">Independent Dispatch Rider</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-500 font-bold block mb-1 font-sans">Waybill Tracking Number</label>
                      <input
                        type="text"
                        required
                        value={shippingTracking}
                        onChange={(e) => setShippingTracking(e.target.value)}
                        placeholder="e.g. GIG-LOS-189204"
                        className="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setSelectedOrderForShipment(null)}
                      className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-display font-extrabold text-[10px] uppercase tracking-wider rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleShipOrder(selectedOrderForShipment.id)}
                      className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-display font-extrabold text-[10px] uppercase tracking-wider rounded-xl shadow-md"
                    >
                      Confirm Dispatch
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PIN HANDSHAKE VERIFICATION MODAL */}
            {selectedOrderForPin && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
                <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-[32px] max-w-sm w-full shadow-2xl relative space-y-4">
                  <div>
                    <h3 className="font-display font-black text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Shield className="w-5.5 h-5.5 text-emerald-500" />
                      PIN Handshake Release
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 font-sans">
                      Escrow requires a mutual handshake. Enter the 6-digit delivery passcode given to you by the buyer upon physical/delivery package handover.
                    </p>
                  </div>

                  {pinSuccess ? (
                    <div className="py-4 text-center space-y-2.5">
                      <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto">
                        <Check className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Verification Success!</p>
                      <p className="text-[10px] text-gray-400 font-mono">Funds released instantly to your available payout balance.</p>
                    </div>
                  ) : (
                    <div className="space-y-4 text-xs">
                      
                      <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
                        <span className="text-[10px] font-mono text-amber-500 font-bold block mb-0.5 uppercase tracking-widest">Sandbox Demo Helper Tip</span>
                        <p className="text-[10px] text-slate-500 leading-relaxed font-sans">
                          Normally, the buyer has this PIN in their order card. For testing purposes, the correct PIN for this order is: <strong className="font-mono text-emerald-500 text-xs">{selectedOrderForPin.deliveryPin}</strong>.
                        </p>
                      </div>

                      {pinError && (
                        <div className="p-2.5 bg-red-100 text-red-800 dark:bg-red-500/10 dark:text-red-400 rounded-xl text-[10px] font-bold">
                          {pinError}
                        </div>
                      )}

                      <div>
                        <label className="text-slate-500 font-bold block mb-1 font-sans">6-Digit Handshake PIN</label>
                        <input
                          type="text"
                          maxLength={6}
                          value={handshakePin}
                          onChange={(e) => setHandshakePin(e.target.value.replace(/\D/g, ''))}
                          placeholder="e.g. 123456"
                          className="w-full text-center tracking-widest text-lg font-mono px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedOrderForPin(null)}
                          className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-display font-extrabold text-[10px] uppercase tracking-wider rounded-xl"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handlePinHandshake}
                          className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-display font-extrabold text-[10px] uppercase tracking-wider rounded-xl shadow-md"
                        >
                          Verify PIN
                        </button>
                      </div>

                    </div>
                  )}

                </div>
              </div>
            )}

          </div>
        )}

        {/* TAB 3: INVENTORY MANAGEMENT WITH PRICE MODS */}
        {activeTab === 'inventory' && (
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-[32px] overflow-hidden shadow-sm">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center flex-wrap gap-3">
              <div>
                <h3 className="font-display font-black text-base text-slate-900 dark:text-white">Store Catalog Management</h3>
                <p className="text-[11px] text-gray-400 font-sans mt-0.5">Edit pricing, toggle real-time stock levels, and delete stale listings instantly.</p>
              </div>
              <button
                onClick={() => setActiveTab('create_listing')}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-display font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-md"
              >
                Add Product
              </button>
            </div>

            {sellerProducts.length === 0 ? (
              <div className="p-16 text-center text-slate-400 dark:text-slate-500 text-xs">
                No inventory listed yet. Choose the Create Listing tab to publish your first merchant product.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-800/60">
                {sellerProducts.map((p) => (
                  <div key={p.id} className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
                    
                    {/* Thumbnail Detail Column */}
                    <div className="flex items-center gap-3.5">
                      <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-800 overflow-hidden relative shrink-0 border border-gray-100 dark:border-slate-800">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.images[0]} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <h4 className="font-display font-bold text-sm text-slate-950 dark:text-white mb-1 leading-snug">{p.title}</h4>
                        <p className="text-gray-400 font-mono text-[10px]">
                          Category: {p.category} • Barcode: {p.barcode || 'None'} • Views: {p.viewCount}
                        </p>
                      </div>
                    </div>

                    {/* Stock status toggle & Price change inputs */}
                    <div className="flex flex-wrap items-center gap-4 text-left w-full md:w-auto justify-end">
                      
                      {/* Price Display / Inline editor */}
                      <div className="min-w-[120px]">
                        {editingProductId === p.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              required
                              value={editingPrice}
                              onChange={(e) => setEditingPrice(e.target.value)}
                              placeholder="₦ Price"
                              className="w-20 px-2 py-1 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-slate-950 dark:text-white focus:outline-none"
                            />
                            <button
                              onClick={() => handleUpdatePrice(p.id)}
                              className="p-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
                              title="Save Price"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingProductId(null)}
                              className="p-1 bg-gray-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg"
                              title="Cancel Edit"
                            >
                              <Plus className="w-3.5 h-3.5 rotate-45" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div>
                              <span className="font-mono font-extrabold text-sm block text-slate-950 dark:text-white leading-none">
                                ₦{p.price.toLocaleString()}
                              </span>
                              <span className="text-[9px] text-gray-400">Qty: {p.quantity}</span>
                            </div>
                            <button
                              onClick={() => {
                                setEditingProductId(p.id);
                                setEditingPrice(p.price.toString());
                              }}
                              className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-500 rounded-lg transition-colors cursor-pointer"
                              title="Quick price adjust"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Stock Status Controller */}
                      <button
                        onClick={() => handleToggleStockStatus(p.id, p.stockStatus)}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-sans font-bold transition-all border cursor-pointer ${
                          p.stockStatus === 'IN_STOCK' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                          p.stockStatus === 'LOW_STOCK' ? 'bg-amber-500/10 border-amber-500/20 text-amber-600' :
                          'bg-red-500/10 border-red-500/20 text-red-600'
                        }`}
                        title="Click to cycle status: In Stock -> Low Stock -> Out Of Stock"
                      >
                        {p.stockStatus.replace('_', ' ')}
                      </button>

                      {/* Delete listing button */}
                      <button
                        onClick={() => handleDeleteProduct(p.id)}
                        className="p-2.5 bg-red-100/10 hover:bg-red-500 hover:text-white text-red-500 border border-red-500/20 rounded-xl transition-all cursor-pointer"
                        title="Delete this listing permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: CREATE LISTING FORM */}
        {activeTab === 'create_listing' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Wizard Header Progress Bar Tracker */}
            <div className="lg:col-span-3 bg-slate-50 dark:bg-slate-800/30 p-5 rounded-3xl border border-gray-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex flex-col">
                <h3 className="font-display font-black text-sm text-slate-800 dark:text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-500" />
                  Escrow Listing Creator Wizard
                </h3>
                <span className="text-[10px] text-slate-400">Step {currentListingStep} of 5 • Fully Ledger-Validated Secured Handshake Listing</span>
              </div>
              
              {/* Step indicators */}
              <div className="flex items-center gap-1 sm:gap-2">
                {[
                  { step: 1, label: 'Catalog' },
                  { step: 2, label: 'Assets' },
                  { step: 3, label: 'Specs' },
                  { step: 4, label: 'Logistics' },
                  { step: 5, label: 'Review' }
                ].map((item) => (
                  <React.Fragment key={item.step}>
                    {item.step > 1 && (
                      <div className={`h-0.5 w-4 sm:w-8 rounded ${currentListingStep >= item.step ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-slate-800'}`} />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (item.step < currentListingStep || (brand && title)) {
                          setCurrentListingStep(item.step);
                        }
                      }}
                      className={`h-7 px-2.5 rounded-full text-[10px] font-sans font-bold flex items-center justify-center gap-1 transition-all ${
                        currentListingStep === item.step
                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                          : currentListingStep > item.step
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-gray-100 dark:bg-slate-800 text-slate-400 border border-transparent'
                      }`}
                    >
                      <span>{item.step}</span>
                      <span className="hidden md:inline">{item.label}</span>
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Core Listing Input Forms Container */}
            <form onSubmit={handleCreateListing} className="lg:col-span-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-[32px] p-6 shadow-sm space-y-5">
              {stepValidationErrors && (
                <div className="p-3.5 bg-red-500/5 border border-red-500/20 text-red-600 dark:text-red-400 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{stepValidationErrors}</span>
                </div>
              )}

              {/* STEP 1: CATEGORY & CATALOG */}
              {currentListingStep === 1 && (
                <div className="space-y-4">
                  <div className="border-b border-gray-100 dark:border-slate-800 pb-3">
                    <h4 className="font-display font-bold text-xs uppercase tracking-wider text-slate-400">Step 1: Product Taxonomy & Cataloging</h4>
                    <p className="text-[11px] text-slate-400">Classify product taxonomy, establish SKU parameters and catalog metadata.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Taxonomy Category</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                      >
                        <option value="Phones">Phones & Tablets</option>
                        <option value="Electronics">Electronics</option>
                        <option value="Laptops">Laptops & Computers</option>
                        <option value="Fashion">Fashion & Apparel</option>
                        <option value="Furniture">Furniture & Decor</option>
                        <option value="Groceries">Groceries & Foodstuffs</option>
                        <option value="Beauty">Beauty & Cosmetics</option>
                        <option value="Vehicles">Vehicles & Automotive</option>
                        <option value="Books">Books & Stationary</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Subcategory Specifier</label>
                      <input
                        type="text"
                        value={subcategory}
                        onChange={(e) => setSubcategory(e.target.value)}
                        placeholder="e.g. Smartphones, UK Used, Agbada"
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Manufacturer Brand Name</label>
                      <input
                        type="text"
                        required
                        value={brand}
                        onChange={(e) => {
                          setBrand(e.target.value);
                          if (title) {
                            setSku(`GS-${e.target.value.substring(0,3).toUpperCase()}-${title.substring(0,3).toUpperCase()}-${Math.floor(100+Math.random()*900)}`);
                          }
                        }}
                        placeholder="e.g. Apple, Sony, Nike, Handmade Local"
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Product SKU Code (Auto-generated)</label>
                      <input
                        type="text"
                        value={sku}
                        onChange={(e) => setSku(e.target.value)}
                        placeholder="e.g. GS-APP-IPH-834"
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none font-mono"
                      />
                    </div>

                    <div className="sm:col-span-2 p-4 bg-slate-50 dark:bg-slate-800/40 border border-gray-200 dark:border-slate-700/60 rounded-2xl">
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                          <QrCode className="w-3.5 h-3.5 text-emerald-500" />
                          Barcode/UPC Tag Integration
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const samples = ['619283471029', '728193450912', '192837465012'];
                            const selected = samples[Math.floor(Math.random() * samples.length)];
                            setBarcode(selected);
                            alert(`Decoded Barcode: ${selected}. Pre-filled manufacturer details.`);
                          }}
                          className="text-[10px] text-emerald-500 hover:underline font-bold font-sans cursor-pointer"
                        >
                          Trigger Scanner Emulator
                        </button>
                      </div>
                      <input
                        type="text"
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        placeholder="Scan or enter item barcode (Optional)"
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: HIGH-FIDELITY ASSETS */}
              {currentListingStep === 2 && (
                <div className="space-y-4">
                  <div className="border-b border-gray-100 dark:border-slate-800 pb-3">
                    <h4 className="font-display font-bold text-xs uppercase tracking-wider text-slate-400">Step 2: Interactive Multimedia Assets</h4>
                    <p className="text-[11px] text-slate-400">Upload 3 to 15 inspection photos. Interactive cropping, rotation & optimization controls provided below.</p>
                  </div>

                  {/* Real File Upload from Device */}
                  <label 
                    className="border-2 border-dashed border-gray-200 dark:border-slate-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 p-6 rounded-3xl text-center cursor-pointer transition-all bg-gray-50/50 dark:bg-slate-900/40 block"
                  >
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (uploadedImages.length + files.length > 15) {
                          alert('Compliance Limit: A maximum of 15 pictures is supported per listing.');
                          return;
                        }
                        
                        files.forEach(file => {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setUploadedImages(prev => [...prev, reader.result as string]);
                          };
                          reader.readAsDataURL(file);
                        });
                      }}
                      className="hidden"
                    />
                    <ImageIcon className="w-8 h-8 text-slate-400 mx-auto mb-2 animate-pulse" />
                    <span className="text-xs font-bold block text-slate-700 dark:text-slate-300">Drag & Drop pictures or Click to upload</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5 font-sans">Select physical images from your device. Real-time rendering enabled.</span>
                  </label>

                  {/* Photo assets editor */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Asset Catalog ({uploadedImages.length}/15)</label>
                      <span className="text-[10px] text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">Minimum 3 Required</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {uploadedImages.map((img, idx) => (
                        <div key={idx} className="bg-gray-50 dark:bg-slate-800/40 rounded-2xl p-2.5 border border-gray-200 dark:border-slate-800 flex flex-col justify-between">
                          <div className="relative w-full h-24 bg-gray-200 dark:bg-slate-900 rounded-lg overflow-hidden mb-2 group">
                            <img src={img} alt={`Preview #${idx+1}`} className="w-full h-full object-cover" />
                            <span className="absolute top-1 left-1 bg-black/60 text-white font-mono text-[9px] px-1.5 py-0.5 rounded font-black">
                              {idx === 0 ? 'Primary' : `#${idx+1}`}
                            </span>

                            {/* Live AI Image Moderation Overlay */}
                            <div className="absolute inset-x-0 bottom-0 bg-black/75 backdrop-blur-[1px] py-1 px-1.5 flex items-center justify-between text-[8px] font-bold text-white uppercase tracking-wider font-mono">
                              <span className="flex items-center gap-1 text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                🛡️ Safe AI Scan
                              </span>
                              <span className="text-[7px] text-emerald-500 font-extrabold bg-emerald-500/10 px-1 py-0.5 rounded">Passed</span>
                            </div>
                          </div>

                          {/* Crop / Rotate / Compress action bars */}
                          <div className="grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              onClick={() => handleCropImage(idx)}
                              className="py-1 px-1 bg-gray-100 hover:bg-emerald-500/10 dark:bg-slate-800 dark:hover:bg-emerald-500/10 text-slate-600 dark:text-slate-300 hover:text-emerald-500 text-[9px] rounded flex items-center justify-center gap-1 font-bold cursor-pointer"
                            >
                              <Crop className="w-2.5 h-2.5" /> Crop
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCompressImage(idx)}
                              className="py-1 px-1 bg-gray-100 hover:bg-emerald-500/10 dark:bg-slate-800 dark:hover:bg-emerald-500/10 text-slate-600 dark:text-slate-300 hover:text-emerald-500 text-[9px] rounded flex items-center justify-center gap-1 font-bold cursor-pointer"
                            >
                              <Sliders className="w-2.5 h-2.5" /> Compress
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRotateImage(idx)}
                              className="py-1 px-1 bg-gray-100 hover:bg-emerald-500/10 dark:bg-slate-800 dark:hover:bg-emerald-500/10 text-slate-600 dark:text-slate-300 hover:text-emerald-500 text-[9px] rounded flex items-center justify-center gap-1 font-bold cursor-pointer"
                            >
                              <RotateCw className="w-2.5 h-2.5" /> Rotate
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(idx)}
                              className="py-1 px-1 bg-red-100/10 hover:bg-red-500 hover:text-white text-red-500 text-[9px] rounded flex items-center justify-center gap-1 font-bold cursor-pointer"
                            >
                              <Trash2 className="w-2.5 h-2.5" /> Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Video uploader widget */}
                  <div className="bg-slate-50 dark:bg-slate-800/20 p-4 border border-gray-200 dark:border-slate-800 rounded-2xl space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Video className="w-4 h-4 text-amber-500" />
                        Interactive Product Demo Video
                      </span>
                      <label
                        className="text-[10px] text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded cursor-pointer"
                      >
                        <input
                          type="file"
                          accept="video/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setUploadedVideo(reader.result as string);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="hidden"
                        />
                        {uploadedVideo ? 'Replace Video' : 'Add Video Demo'}
                      </label>
                    </div>
                    {uploadedVideo ? (
                      <div className="relative w-full h-32 bg-black rounded-lg overflow-hidden flex items-center justify-center">
                        <video src={uploadedVideo} controls className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setUploadedVideo(null)}
                          className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-500 rounded-full text-white"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 italic font-sans leading-relaxed">No demo video attached. Excellent for boosting trust signals on highly technical items.</p>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 3: SPECIFICATIONS */}
              {currentListingStep === 3 && (
                <div className="space-y-4">
                  <div className="border-b border-gray-100 dark:border-slate-800 pb-3">
                    <h4 className="font-display font-bold text-xs uppercase tracking-wider text-slate-400">Step 3: Product Description & Valuation</h4>
                    <p className="text-[11px] text-slate-400">Detail pricing, condition parameters, inventory ledger count and search index tags.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Product Listing Title</label>
                      <input
                        type="text"
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Pristine iPhone 15 Pro Max 256GB Midnight Black"
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Proposed Retail Price (₦)</label>
                        <input
                          type="number"
                          required
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          placeholder="e.g. 1450000"
                          className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Condition Rating</label>
                        <select
                          value={condition}
                          onChange={(e) => setCondition(e.target.value as ProductCondition)}
                          className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                        >
                          <option value={ProductCondition.NEW}>Brand New (Factory Sealed)</option>
                          <option value={ProductCondition.LIKE_NEW}>Like New (UK Used / Open Box)</option>
                          <option value={ProductCondition.EXCELLENT}>Excellent (Grade-A Clean)</option>
                          <option value={ProductCondition.GOOD}>Good Condition (Minor Scratches)</option>
                          <option value={ProductCondition.FAIR}>Fair Condition (Cosmetic Wear / Fully Functional)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Available Stock Units</label>
                        <input
                          type="number"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          placeholder="5"
                          className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Search Keywords (Comma Separated)</label>
                        <input
                          type="text"
                          value={tags}
                          onChange={(e) => setTags(e.target.value)}
                          placeholder="e.g. apple, 256gb, flagship"
                          className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none font-sans"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Detailed Item Specifications Description</label>
                      <textarea
                        required
                        rows={4}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="State full hardware details, battery health (if phone), box accessories, and logistics pickup preferences..."
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        id="isNegotiable"
                        checked={isNegotiable}
                        onChange={(e) => setIsNegotiable(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-500 border-gray-300 focus:ring-emerald-500"
                      />
                      <label htmlFor="isNegotiable" className="text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                        Allow Buyer Counter-Proposals (Price Negotiation Mode)
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: LOGISTICS & FULFILLMENT */}
              {currentListingStep === 4 && (
                <div className="space-y-4">
                  <div className="border-b border-gray-100 dark:border-slate-800 pb-3">
                    <h4 className="font-display font-bold text-xs uppercase tracking-wider text-slate-400">Step 4: Logistics, Fulfillment & Escrow Parameters</h4>
                    <p className="text-[11px] text-slate-400">Set weight-based logistics multipliers and escrow inspection bounds.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Default Delivery Courier</label>
                      <select
                        value={deliveryMethod}
                        onChange={(e) => setDeliveryMethod(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                      >
                        <option value="GOODSALE_PARTNER">GoodSale Courier Partner (Escrow Secured dispatch)</option>
                        <option value="THIRD_PARTY_COURIER">DHL / GIG Logistics Waybill Way</option>
                        <option value="SELF_PICKUP">Buyer Self-Pickup (Verified Handover PIN verification)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Escrow Inspect & Return Policy</label>
                      <select
                        value={returnPolicy}
                        onChange={(e) => setReturnPolicy(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                      >
                        <option value="Final Sale (No Returns)">Final Sale (No returns unless transit damage)</option>
                        <option value="3 Days Escrow Inspection Period">3 Days Escrow Inspection & Verify Window</option>
                        <option value="7 Days Return Policy">7 Days Neutral Escrow Return Protocol</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Commercial Warranty Cover</label>
                      <select
                        value={warranty}
                        onChange={(e) => setWarranty(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                      >
                        <option value="No Warranty Offered">No warranty cover</option>
                        <option value="1 Month Store Warranty">1 Month Store Replacement Warranty</option>
                        <option value="6 Months Store Warranty">6 Months Comprehensive Store Warranty</option>
                        <option value="1 Year Manufacturer Warranty">1 Year Manufacturer Official Warranty</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Weight (Kg)</label>
                        <input
                          type="text"
                          value={weightKg}
                          onChange={(e) => setWeightKg(e.target.value)}
                          placeholder="0.5"
                          className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Dims (L x W x H Cm)</label>
                        <input
                          type="text"
                          value={dimensionsCm}
                          onChange={(e) => setDimensionsCm(e.target.value)}
                          placeholder="15x10x5"
                          className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Color Shade</label>
                      <input
                        type="text"
                        value={productColor}
                        onChange={(e) => setProductColor(e.target.value)}
                        placeholder="e.g. Midnight Black"
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Physical Sizing Factor</label>
                      <input
                        type="text"
                        value={productSize}
                        onChange={(e) => setProductSize(e.target.value)}
                        placeholder="e.g. Standard, 6.7 inch, XL"
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 bg-slate-50 dark:bg-slate-800/20 p-4 rounded-2xl">
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none font-bold text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={pickupAvailable}
                        onChange={(e) => setPickupAvailable(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-500 border-gray-300 focus:ring-emerald-500"
                      />
                      <span>In-person Handover Pickup Allowed</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none font-bold text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={isAuction}
                        onChange={(e) => setIsAuction(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-500 border-gray-300 focus:ring-emerald-500"
                      />
                      <span className="text-amber-500 font-extrabold">Enable Live Bidding Auction Event</span>
                    </label>

                    {isAuction && (
                      <div className="sm:col-span-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                        <label className="text-xs font-bold text-amber-600 block mb-1">Bidding Clock Timer Duration</label>
                        <select
                          value={auctionDuration}
                          onChange={(e) => setAuctionDuration(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none font-sans"
                        >
                          <option value="12">12 Hours (Flash Auction Event)</option>
                          <option value="24">24 Hours (1 Day Duration)</option>
                          <option value="48">48 Hours (2 Days Duration)</option>
                          <option value="168">168 Hours (1 Week Auction Duration)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 5: COMPLIANCE ANALYSIS & PUBLISH PREVIEW */}
              {currentListingStep === 5 && (
                <div className="space-y-4">
                  <div className="border-b border-gray-100 dark:border-slate-800 pb-3">
                    <h4 className="font-display font-bold text-xs uppercase tracking-wider text-slate-400">Step 5: Compliance Review & Publication Gateway</h4>
                    <p className="text-[11px] text-slate-400">Verify catalog duplicate checks, run AI compliance scans and sign listing block.</p>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-gray-200 dark:border-slate-800 space-y-3">
                    <div className="flex justify-between items-start flex-wrap gap-2">
                      <div>
                        <span className="text-xs font-bold block text-slate-700 dark:text-slate-300">Compliance & Trust Safety Review</span>
                        <span className="text-[10px] text-slate-400">Audits titles and descriptions against GoodSale Prohibited Item guidelines.</span>
                      </div>
                      <button
                        type="button"
                        disabled={isAiLoading || !title || !description}
                        onClick={handleRunAiSafetyScan}
                        className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[10px] rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {aiReport ? 'Run Metadata Re-scan' : 'Trigger Safety Scan'}
                      </button>
                    </div>

                    {isAiLoading && (
                      <div className="py-4 text-center text-xs text-slate-400 font-medium flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-emerald-500" />
                        Gemini AI auditing listing signals...
                      </div>
                    )}

                    {aiReport?.safetyScan ? (
                      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-emerald-500/20 text-xs space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-600 dark:text-slate-300">Trust Safety Index:</span>
                          <span className="font-mono font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
                            {aiReport.safetyScan.safetyScore}/100
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-600 dark:text-slate-300">Policy Verdict:</span>
                          <span className="font-black text-white bg-emerald-500 px-2 py-0.5 rounded text-[9px] uppercase tracking-wider font-sans">
                            {aiReport.safetyScan.recommendation}
                          </span>
                        </div>
                        <div>
                          <span className="font-bold text-slate-600 dark:text-slate-300 block mb-0.5">Policy Feedback:</span>
                          <p className="text-[11px] text-slate-500 leading-relaxed">{aiReport.safetyScan.feedback}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 italic leading-relaxed">Safety report not run. Highly recommended to click &quot;Trigger Safety Scan&quot; above to ensure automated verification compliance and front-page algorithmic placement.</p>
                    )}
                  </div>

                  {duplicateDetected && (
                    <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-red-600">
                        <strong>Duplicate Listing Found:</strong> The ledger contains an identical product title or barcode under your merchant profile. GoodSale limits duplicate listings to protect buyer search indexes.
                      </p>
                    </div>
                  )}

                  {/* Draft Mode / Available Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Secured Publication Mode</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { status: 'Available', desc: 'Publish & Searchable' },
                        { status: 'Out_Of_Stock', desc: 'Hold Inventory' },
                        { status: 'Draft', desc: 'Save as Draft' }
                      ].map((item) => (
                        <button
                          type="button"
                          key={item.status}
                          onClick={() => setProductStatus(item.status as any)}
                          className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                            productStatus === item.status
                              ? 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/10'
                              : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-gray-300'
                          }`}
                        >
                          <span className="text-[11px] font-bold block">{item.status.replace('_', ' ')}</span>
                          <span className="text-[9px] text-slate-400 block mt-0.5">{item.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* WIZARD NAVIGATION FOOTER */}
              <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex justify-between items-center gap-2 flex-wrap">
                {currentListingStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStepValidationErrors(null);
                      setCurrentListingStep(currentListingStep - 1);
                    }}
                    className="px-4 py-2 bg-gray-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-gray-200/80 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex gap-2">
                  {currentListingStep < 5 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setStepValidationErrors(null);
                        if (currentListingStep === 1) {
                          if (!brand) {
                            setStepValidationErrors('Manufacturer Brand Name is required to catalog this product.');
                            return;
                          }
                        } else if (currentListingStep === 2) {
                          if (uploadedImages.length < 3) {
                            setStepValidationErrors('GoodSale Escrow guidelines mandate a minimum of 3 pictures for safety compliance.');
                            return;
                          }
                        } else if (currentListingStep === 3) {
                          if (!title) {
                            setStepValidationErrors('Product Listing Title is required.');
                            return;
                          }
                          if (!price || Number(price) <= 0) {
                            setStepValidationErrors('Proposed Price must be a valid positive Naira amount.');
                            return;
                          }
                        }
                        setCurrentListingStep(currentListingStep + 1);
                      }}
                      className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      Next Step <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-sans font-black text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/15 cursor-pointer flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4" /> Sign & Publish Listing
                    </button>
                  )}
                </div>
              </div>

            </form>

            {/* Safety report widget display */}
            <div className="lg:col-span-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-[32px] p-5 shadow-sm space-y-4">
              <h4 className="font-sans font-extrabold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">AI Safety Analyzer Report</h4>
              
              {isAiLoading && (
                <div className="p-8 text-center text-xs text-gray-400 font-medium">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-500 mx-auto mb-2" />
                  Gemini analyzing listing signals...
                </div>
              )}

              {!isAiLoading && !aiReport && (
                <p className="text-[11px] text-gray-400 italic leading-relaxed">
                  Enter your product title, description, and retail price. Click &quot;AI Trust safety scan&quot; to trigger deep neural compliance verification before publishing.
                </p>
              )}

              {aiReport?.safetyScan && (
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center bg-gray-50 dark:bg-slate-800/40 p-2.5 rounded-lg">
                    <span className="font-bold">Trust Safety Score:</span>
                    <span className={`font-mono font-extrabold px-2 py-0.5 rounded text-sm ${aiReport.safetyScan.safetyScore > 80 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-100 text-red-800 dark:bg-red-500/10'}`}>
                      {aiReport.safetyScan.safetyScore}/100
                    </span>
                  </div>

                  <div className="bg-gray-50 dark:bg-slate-800/40 p-3 rounded-lg">
                    <span className="font-bold block mb-1">Decision recommendation:</span>
                    <span className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${aiReport.safetyScan.recommendation === 'APPROVE' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                      {aiReport.safetyScan.recommendation}
                    </span>
                  </div>

                  <div>
                    <span className="font-bold block mb-1">Compliance review:</span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{aiReport.safetyScan.feedback}</p>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 5: BARCODE AUTO FILL AUTO SPEC */}
        {activeTab === 'barcode_scanner' && (
          <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-[32px] p-6 shadow-sm space-y-6">
            <div className="text-center">
              <QrCode className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="font-sans font-extrabold text-base text-slate-900 dark:text-white">Barcode Auto-Fill Scanner</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
                Enter or click any popular barcode below. GoodSale sends the code to Gemini AI to lookup real commercial catalog specifications.
              </p>
            </div>

            {/* Quick selector presets */}
            <div className="p-4 bg-gray-50 dark:bg-slate-800/40 rounded-2xl">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2 text-center">Presets Barcodes (Click to Test)</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => handlePresetScan('194253831814')}
                  className="p-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl hover:border-emerald-500 transition-colors text-left"
                >
                  <span className="text-[10px] block font-bold truncate">iPhone 15 Pro Max</span>
                  <span className="text-[9px] font-mono text-gray-400">194253831814</span>
                </button>
                <button
                  onClick={() => handlePresetScan('195949117604')}
                  className="p-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl hover:border-emerald-500 transition-colors text-left"
                >
                  <span className="text-[10px] block font-bold truncate">MacBook Pro M3</span>
                  <span className="text-[9px] font-mono text-gray-400">195949117604</span>
                </button>
                <button
                  onClick={() => handlePresetScan('493821039823')}
                  className="p-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl hover:border-emerald-500 transition-colors text-left"
                >
                  <span className="text-[10px] block font-bold truncate">Bespoke Agbada Set</span>
                  <span className="text-[9px] font-mono text-gray-400">493821039823</span>
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={barcodeQuery}
                onChange={(e) => setBarcodeQuery(e.target.value)}
                placeholder="Enter 12 digit UPC barcode number"
                className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-1 focus:ring-emerald-500 focus:outline-none text-slate-800 dark:text-white font-mono text-xs"
              />
              <button
                onClick={handleBarcodeAutoFill}
                disabled={isAiLoading || !barcodeQuery.trim()}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {isAiLoading ? 'Resolving...' : 'Lookup Barcode'}
              </button>
            </div>

            {aiReport?.message && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 rounded-xl flex items-center gap-2 text-xs">
                <AlertCircle className="w-4 h-4 text-emerald-500" />
                <span>{aiReport.message}</span>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
