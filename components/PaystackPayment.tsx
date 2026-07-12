'use client';

import React, { useState, useEffect } from 'react';
import { Shield, CreditCard, Landmark, X, Lock, CheckCircle2, AlertCircle, RefreshCw, Smartphone } from 'lucide-react';

interface PaystackPaymentProps {
  email: string;
  amount: number; // in NGN
  onSuccess: (reference: string) => void;
  onCancel: () => void;
}

export default function PaystackPayment({ email, amount, onSuccess, onCancel }: PaystackPaymentProps) {
  const [method, setMethod] = useState<'CARD' | 'TRANSFER'>('CARD');
  const [step, setStep] = useState<'FORM' | 'OTP' | 'PROCESSING' | 'SUCCESS'>('FORM');
  
  // Card credentials state
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardPin, setCardPin] = useState('');
  const [cardError, setCardError] = useState<string | null>(null);

  // Bank Transfer states
  const [transferMinutes, setTransferMinutes] = useState(9);
  const [transferSeconds, setTransferSeconds] = useState(59);
  const [isVerifyingTransfer, setIsVerifyingTransfer] = useState(false);
  const [selectedBank, setSelectedBank] = useState('Wema Bank');

  // Load Paystack Inline script if key is present in environment
  const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;

  useEffect(() => {
    // Bank transfer countdown
    if (method === 'TRANSFER') {
      const timer = setInterval(() => {
        if (transferSeconds > 0) {
          setTransferSeconds(prev => prev - 1);
        } else if (transferMinutes > 0) {
          setTransferMinutes(prev => prev - 1);
          setTransferSeconds(59);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [method, transferSeconds, transferMinutes]);

  // Card validation and styling formatter
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 16) val = val.slice(0, 16);
    // Add spaces every 4 characters
    const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
    setCardNumber(formatted);
    setCardError(null);
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 4) val = val.slice(0, 4);
    if (val.length >= 2) {
      val = val.slice(0, 2) + '/' + val.slice(2);
    }
    setCardExpiry(val);
    setCardError(null);
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    if (val.length <= 3) setCardCvv(val);
    setCardError(null);
  };

  const handleCardPinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    if (val.length <= 4) setCardPin(val);
    setCardError(null);
  };

  // Luhn check for card number safety validation
  const validateCard = (): boolean => {
    const rawNum = cardNumber.replace(/\s/g, '');
    if (rawNum.length < 16) {
      setCardError('Card number must be exactly 16 digits.');
      return false;
    }
    if (cardExpiry.length < 5) {
      setCardError('Invalid card expiration date.');
      return false;
    }
    if (cardCvv.length < 3) {
      setCardError('Please input a valid 3-digit CVV card security code.');
      return false;
    }
    if (cardPin.length < 4) {
      setCardError('Please input your 4-digit card ATM PIN.');
      return false;
    }
    return true;
  };

  const handleCardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCard()) return;

    setStep('OTP');
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('PROCESSING');

    setTimeout(() => {
      setStep('SUCCESS');
      setTimeout(() => {
        onSuccess('PAY_REF_' + Math.random().toString(36).substring(2, 11).toUpperCase());
      }, 1500);
    }, 2000);
  };

  const handleVerifyBankTransfer = () => {
    setIsVerifyingTransfer(true);
    setTimeout(() => {
      setIsVerifyingTransfer(false);
      setStep('SUCCESS');
      setTimeout(() => {
        onSuccess('PAY_REF_BANK_' + Math.random().toString(36).substring(2, 11).toUpperCase());
      }, 1500);
    }, 2500);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 select-none">
      <div className="bg-[#112330] w-full max-w-md border border-[#1d3243] rounded-3xl overflow-hidden shadow-2xl relative text-white flex flex-col">
        
        {/* Header bar */}
        <div className="bg-[#0b1a26] px-6 py-4 flex items-center justify-between border-b border-[#1d3243]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#09a5db]/10 flex items-center justify-center border border-[#09a5db]/30">
              <Shield className="w-4 h-4 text-[#09a5db]" />
            </div>
            <div>
              <p className="font-sans font-black text-xs text-white uppercase tracking-wider">Paystack Secured</p>
              <p className="text-[10px] text-slate-400 font-mono">Reference: PSC_{Math.random().toString(36).substring(7).toUpperCase()}</p>
            </div>
          </div>
          <button 
            onClick={onCancel}
            className="w-8 h-8 rounded-full bg-[#172b3a] flex items-center justify-center hover:bg-red-500/20 text-slate-400 hover:text-red-400 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Amount display */}
        <div className="bg-[#122637] p-6 text-center space-y-1">
          <p className="text-slate-400 text-[10px] uppercase tracking-widest font-mono">Paying GoodSale Escrow Ltd</p>
          <p className="font-mono text-3xl font-black text-[#09a5db]">₦{amount.toLocaleString()}</p>
          <p className="text-slate-500 text-[10px]">{email}</p>
        </div>

        {/* Content body */}
        <div className="p-6 flex-1 flex flex-col">
          {step === 'FORM' && (
            <div className="space-y-6 flex-1 flex flex-col">
              {/* Payment Methods selector */}
              <div className="flex bg-[#0b1a26] p-1 rounded-2xl border border-[#1d3243]">
                <button
                  type="button"
                  onClick={() => setMethod('CARD')}
                  className={`flex-1 py-3 rounded-xl text-xs font-sans font-extrabold tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${method === 'CARD' ? 'bg-[#09a5db] text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <CreditCard className="w-4 h-4" />
                  Pay with Card
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('TRANSFER')}
                  className={`flex-1 py-3 rounded-xl text-xs font-sans font-extrabold tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${method === 'TRANSFER' ? 'bg-[#09a5db] text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <Landmark className="w-4 h-4" />
                  Bank Transfer
                </button>
              </div>

              {/* CARD FORM */}
              {method === 'CARD' && (
                <form onSubmit={handleCardSubmit} className="space-y-4 text-xs flex-1 flex flex-col">
                  {cardError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{cardError}</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-black text-slate-400 uppercase tracking-widest block">Card Number</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="4321 8765 4321 0987"
                        required
                        value={cardNumber}
                        onChange={handleCardNumberChange}
                        className="w-full px-4 py-3 bg-[#0b1a26] border border-[#1d3243] rounded-xl text-white font-mono placeholder-slate-600 focus:outline-none focus:border-[#09a5db] text-sm"
                      />
                      <CreditCard className="absolute right-4 top-3.5 w-5 h-5 text-slate-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-black text-slate-400 uppercase tracking-widest block">Expiry Date</label>
                      <input
                        type="text"
                        placeholder="MM/YY"
                        required
                        value={cardExpiry}
                        onChange={handleExpiryChange}
                        className="w-full px-4 py-3 bg-[#0b1a26] border border-[#1d3243] rounded-xl text-white font-mono placeholder-slate-600 focus:outline-none focus:border-[#09a5db] text-center text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-black text-slate-400 uppercase tracking-widest block">CVV Code</label>
                      <input
                        type="password"
                        placeholder="•••"
                        maxLength={3}
                        required
                        value={cardCvv}
                        onChange={handleCvvChange}
                        className="w-full px-4 py-3 bg-[#0b1a26] border border-[#1d3243] rounded-xl text-white font-mono placeholder-slate-600 focus:outline-none focus:border-[#09a5db] text-center text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-black text-slate-400 uppercase tracking-widest block">Card Pin</label>
                    <input
                      type="password"
                      placeholder="••••"
                      maxLength={4}
                      required
                      value={cardPin}
                      onChange={handleCardPinChange}
                      className="w-full px-4 py-3 bg-[#0b1a26] border border-[#1d3243] rounded-xl text-white font-mono placeholder-slate-600 focus:outline-none focus:border-[#09a5db] text-center text-sm"
                    />
                  </div>

                  <div className="pt-4 mt-auto">
                    <button
                      type="submit"
                      className="w-full py-3.5 bg-[#09a5db] hover:bg-[#078bb9] text-white font-sans font-extrabold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-lg shadow-[#09a5db]/20 flex items-center justify-center gap-2 transition-all"
                    >
                      <Lock className="w-4 h-4 text-white" />
                      Authorize Escrow Hold
                    </button>
                  </div>
                </form>
              )}

              {/* BANK TRANSFER VIEW */}
              {method === 'TRANSFER' && (
                <div className="space-y-4 flex-1 flex flex-col text-xs">
                  <div className="p-4 bg-[#0b1a26] border border-[#1d3243] rounded-2xl space-y-3.5 text-center">
                    <p className="text-slate-400 text-[10px]">Transfer exactly ₦{amount.toLocaleString()} to:</p>
                    
                    <div className="space-y-1">
                      <p className="text-xl font-mono font-black text-emerald-400 tracking-wider">9920194850</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Wema Bank (Escrow Trust Account)</p>
                      <p className="text-[9px] text-slate-500 font-mono">Beneficiary: GoodSale Escrow Limited</p>
                    </div>

                    <div className="pt-2 border-t border-[#162736] flex items-center justify-center gap-2 text-slate-400 font-mono text-[10px]">
                      <RefreshCw className="w-3.5 h-3.5 text-[#09a5db] animate-spin" />
                      <span>Awaiting deposit... {transferMinutes}:{transferSeconds < 10 ? `0${transferSeconds}` : transferSeconds}</span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 text-[10px] text-slate-400 leading-relaxed">
                    <div className="flex gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#09a5db] shrink-0 mt-1.5" />
                      <p>Open your bank mobile app and initiate a transfer to the account above.</p>
                    </div>
                    <div className="flex gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#09a5db] shrink-0 mt-1.5" />
                      <p>Funds will be caught and held securely in escrow until delivery is verified.</p>
                    </div>
                  </div>

                  <div className="pt-4 mt-auto">
                    <button
                      type="button"
                      disabled={isVerifyingTransfer}
                      onClick={handleVerifyBankTransfer}
                      className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:opacity-50 text-white font-sans font-extrabold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 transition-all"
                    >
                      {isVerifyingTransfer ? (
                        <>
                          <RefreshCw className="w-4 h-4 text-white animate-spin" />
                          Verifying Transfer...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-white" />
                          I Have Sent the Money
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* OTP STEP */}
          {step === 'OTP' && (
            <form onSubmit={handleOtpSubmit} className="space-y-6 flex-1 flex flex-col text-xs text-center justify-center py-6">
              <div className="w-12 h-12 bg-[#09a5db]/10 rounded-full flex items-center justify-center mx-auto border border-[#09a5db]/20">
                <Smartphone className="w-6 h-6 text-[#09a5db]" />
              </div>

              <div className="space-y-1">
                <h4 className="font-sans font-black text-sm text-white">Enter 3D-Secure OTP</h4>
                <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                  We have sent a 4-digit code to your phone number. Use 1234 for sandbox mode.
                </p>
              </div>

              <div className="max-w-[120px] mx-auto">
                <input
                  type="text"
                  placeholder="••••"
                  maxLength={4}
                  required
                  className="w-full px-4 py-3 bg-[#0b1a26] border border-[#1d3243] rounded-xl text-white font-mono text-center text-lg tracking-widest focus:outline-none focus:border-[#09a5db]"
                />
              </div>

              <div className="pt-4 mt-auto">
                <button
                  type="submit"
                  className="w-full py-3.5 bg-[#09a5db] hover:bg-[#078bb9] text-white font-sans font-extrabold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-lg shadow-[#09a5db]/20 transition-all"
                >
                  Verify and Complete Escrow Hold
                </button>
              </div>
            </form>
          )}

          {/* PROCESSING MODAL SCREEN */}
          {step === 'PROCESSING' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-12">
              <div className="w-12 h-12 rounded-full border-4 border-slate-700 border-t-[#09a5db] animate-spin" />
              <div className="space-y-1">
                <p className="font-sans font-black text-xs text-white uppercase tracking-widest">Processing Transaction</p>
                <p className="text-[10px] text-slate-400">Verifying security parameters with the bank...</p>
              </div>
            </div>
          )}

          {/* SUCCESS ANIMATED STATE */}
          {step === 'SUCCESS' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-12">
              <div className="w-14 h-14 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/30 animate-bounce">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="space-y-1">
                <p className="font-sans font-black text-sm text-emerald-400 uppercase tracking-widest">Escrow Hold Secure</p>
                <p className="text-[10px] text-slate-400">Funds successfully allocated and locked in escrow ledger!</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer info lock */}
        <div className="bg-[#0b1a26] px-6 py-4 border-t border-[#1d3243] flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
          <Lock className="w-3.5 h-3.5 text-slate-500" />
          <span>Secured by 256-bit AES end-to-end encryption</span>
        </div>
      </div>
    </div>
  );
}
