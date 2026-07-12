// components/BrandCenterView.tsx
'use client';

import React, { useState } from 'react';
import { 
  motion 
} from 'motion/react';
import { 
  CheckCircle, Shield, ShoppingBag, Eye, Copy, Check, Download, 
  Sparkles, Palette, Type, Layers, ExternalLink, Image as ImageIcon, 
  Grid, Laptop, Smartphone, FileText, ArrowLeft, Award
} from 'lucide-react';
import Logo, { LogoIcon } from './LogoIcon';

// Mock our beautiful generated images using premium placeholder URLs
const packagingImg = { src: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=800&auto=format&fit=crop' };
const uniformImg = { src: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?q=80&w=800&auto=format&fit=crop' };

interface BrandCenterViewProps {
  onBack: () => void;
}

export default function BrandCenterView({ onBack }: BrandCenterViewProps) {
  const [copiedColor, setCopiedColor] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'concept' | 'typography' | 'mockups' | 'collateral'>('concept');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedColor(text);
    setTimeout(() => setCopiedColor(null), 2000);
  };

  const brandColors = [
    { name: 'Trust Emerald', hex: '#10b981', desc: 'Represents secure, thriving commerce & local market prosperity.', bg: 'bg-emerald-500' },
    { name: 'Elite Trust Gold', hex: '#f59e0b', desc: 'Denotes official identity verification, safety, & prestige.', bg: 'bg-amber-500' },
    { name: 'Cosmic Slate', hex: '#0f172a', desc: 'Deep background base that frames our modern luxury aesthetics.', bg: 'bg-slate-900' },
    { name: 'Neutral White', hex: '#f8fafc', desc: 'Ensures optimal legibility and generous breathing room.', bg: 'bg-slate-50' },
  ];

  return (
    <div className="bg-gray-50 dark:bg-slate-950 min-h-screen py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-300" id="brand-center-view">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header navigation bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-gray-200 dark:border-slate-800">
          <div>
            <button 
              onClick={onBack}
              className="group flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
              Return to Marketplace
            </button>
            <h1 className="font-sans font-black text-2xl sm:text-3xl text-slate-900 dark:text-white tracking-tight">
              GoodSale <span className="text-emerald-500">Brand Kit</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl font-sans">
              Official design documentation, visual guidelines, and real-world mockups of the GoodSale ecosystem.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-500/20">
              V1.0.0 Spec
            </span>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-gray-100 dark:border-slate-900 overflow-x-auto pb-px gap-2">
          {[
            { id: 'concept', label: 'Logo & Concept', icon: Sparkles },
            { id: 'typography', label: 'Color & Typography', icon: Palette },
            { id: 'mockups', label: 'Digital Assets', icon: Laptop },
            { id: 'collateral', label: 'Physical Collateral', icon: ImageIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === tab.id 
                    ? 'border-emerald-500 text-emerald-500 dark:text-emerald-400 font-extrabold' 
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Dynamic Views */}
        {activeTab === 'concept' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* The Logo Showpiece */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800/80 rounded-3xl p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden">
              <div className="absolute top-4 left-4 text-[9px] font-mono text-gray-400 dark:text-slate-500">OFFICIAL LOGOMARK</div>
              
              <div className="p-8 bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-gray-100 dark:border-slate-800/50 flex items-center justify-center w-48 h-48 group">
                <LogoIcon size={120} variant="solid" className="transform group-hover:scale-105 transition-transform duration-500" />
              </div>

              <div className="space-y-2">
                <Logo iconSize={40} textColorClass="text-slate-950 dark:text-white text-2xl" />
                <p className="text-xs text-slate-500 max-w-sm">
                  Our custom logo merges safe transaction mechanisms with dynamic local exchange.
                </p>
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-slate-800/60 w-full grid grid-cols-2 gap-2">
                <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-gray-100 dark:border-slate-800 text-left">
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Aspect Ratio</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">1:1 Symmetric</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-gray-100 dark:border-slate-800 text-left">
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Style Spec</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Refined Mono</span>
                </div>
              </div>
            </div>

            {/* Logo Anatomy Analysis */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm space-y-6">
                <h3 className="font-sans font-bold text-base text-slate-900 dark:text-white">Concept Anatomy</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Bag */}
                  <div className="p-4 bg-emerald-50/30 dark:bg-emerald-500/5 border border-emerald-500/10 rounded-2xl space-y-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                      <ShoppingBag className="w-4 h-4" />
                    </div>
                    <h4 className="font-sans font-bold text-xs text-slate-950 dark:text-white">The Shopping Bag</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Represents active marketplace utility, user-friendly consumer-to-consumer commerce, and local economic exchange.
                    </p>
                  </div>

                  {/* Shield */}
                  <div className="p-4 bg-blue-50/30 dark:bg-blue-500/5 border border-blue-500/10 rounded-2xl space-y-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                      <Shield className="w-4 h-4" />
                    </div>
                    <h4 className="font-sans font-bold text-xs text-slate-950 dark:text-white">The Shield Contour</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Ensures premium transaction security, locked escrow guarantees, and a complete shield against fraudulent activities.
                    </p>
                  </div>

                  {/* Checkmark */}
                  <div className="p-4 bg-amber-50/30 dark:bg-amber-500/5 border border-amber-500/10 rounded-2xl space-y-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                      <CheckCircle className="w-4 h-4" />
                    </div>
                    <h4 className="font-sans font-bold text-xs text-slate-950 dark:text-white">The Checkmark</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Denotes premium identity verification, trusted merchant gold badges, and successful delivery tracking verification.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 rounded-2xl">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">Our Branding Principle</span>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic">
                    &quot;True luxury doesn&apos;t make noise. By eliminating distracting generic visual metaphors and complex color gradients, the GoodSale icon achieves high-fidelity recognition at any scale—from a tiny 16px tab icon to a giant city-wide billboard.&quot;
                  </p>
                </div>
              </div>

              {/* Grid of Variants */}
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm space-y-4">
                <h3 className="font-sans font-bold text-base text-slate-900 dark:text-white">Branding Versatility</h3>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 border border-gray-100 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center text-center space-y-2">
                    <LogoIcon size={32} variant="solid" />
                    <span className="text-[10px] font-bold text-slate-900 dark:text-slate-200">Solid Emerald</span>
                  </div>
                  
                  <div className="p-4 border border-gray-100 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center text-center space-y-2">
                    <LogoIcon size={32} variant="outline" />
                    <span className="text-[10px] font-bold text-slate-900 dark:text-slate-200">Geometric Slate</span>
                  </div>

                  <div className="p-4 border border-gray-100 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center text-center space-y-2 bg-slate-950">
                    <LogoIcon size={32} variant="gold" />
                    <span className="text-[10px] font-bold text-white">Trust Gold</span>
                  </div>

                  <div className="p-4 border border-gray-100 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center text-center space-y-2">
                    <LogoIcon size={32} variant="dark" />
                    <span className="text-[10px] font-bold text-slate-900 dark:text-slate-200">Minimal Monochrome</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === 'typography' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Brand Colors */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm space-y-6">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-emerald-500" />
                <h3 className="font-sans font-bold text-base text-slate-900 dark:text-white">Color Architecture</h3>
              </div>

              <div className="space-y-4">
                {brandColors.map((color) => (
                  <div key={color.hex} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 rounded-2xl gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl shadow-inner ${color.bg}`} />
                      <div>
                        <h4 className="font-sans font-bold text-xs text-slate-900 dark:text-white">{color.name}</h4>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed max-w-xs">{color.desc}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => copyToClipboard(color.hex)}
                      className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg text-[10px] font-bold font-mono text-slate-600 dark:text-slate-400 hover:text-emerald-500 flex items-center gap-1.5 transition-all"
                    >
                      {copiedColor === color.hex ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          {color.hex}
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Typography Spec */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm space-y-6">
              <div className="flex items-center gap-2">
                <Type className="w-5 h-5 text-emerald-500" />
                <h3 className="font-sans font-bold text-base text-slate-900 dark:text-white">Refined Geometric Typography</h3>
              </div>

              <div className="space-y-5">
                <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 rounded-2xl space-y-3">
                  <div className="border-b border-gray-200/50 dark:border-slate-800/50 pb-2">
                    <span className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-widest">DISPLAY TYPE SPEC</span>
                    <h2 className="font-sans font-extrabold text-xl sm:text-2xl text-slate-950 dark:text-white tracking-tight mt-1">
                      Good<span className="text-emerald-500 font-black">Sale</span>
                    </h2>
                  </div>
                  <div className="text-[10px] text-slate-500 font-sans space-y-1">
                    <p><strong>Font Family:</strong> Inter, custom-tuned geometric tracking</p>
                    <p><strong>Spacing:</strong> <code className="font-mono bg-white dark:bg-slate-900 px-1 py-0.5 border border-gray-100 dark:border-slate-800 rounded">tracking-tight (-0.025em)</code></p>
                    <p><strong>Weight Pair:</strong> Extrabold paired with Black</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 rounded-2xl space-y-3">
                  <div className="border-b border-gray-200/50 dark:border-slate-800/50 pb-2">
                    <span className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-widest">SUBTITLE TAGLINE SPEC</span>
                    <p className="font-mono text-xs text-slate-900 dark:text-white tracking-[0.25em] uppercase leading-none mt-1 font-semibold">
                      Buy. Sell. Trust.
                    </p>
                  </div>
                  <div className="text-[10px] text-slate-500 font-sans space-y-1">
                    <p><strong>Font Family:</strong> JetBrains Mono / Fira Code</p>
                    <p><strong>Spacing:</strong> <code className="font-mono bg-white dark:bg-slate-900 px-1 py-0.5 border border-gray-100 dark:border-slate-800 rounded">tracking-[0.25em] (4px letter spacing)</code></p>
                    <p><strong>Case:</strong> Force Uppercase</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'mockups' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* App Icon Mockup */}
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-slate-500 text-[9px] font-bold uppercase rounded font-mono">Mobile App Icon</span>
                <Smartphone className="w-4 h-4 text-slate-400" />
              </div>
              
              <div className="bg-slate-100 dark:bg-slate-950 rounded-2xl h-48 flex items-center justify-center relative overflow-hidden">
                {/* Simulated Phone Screen */}
                <div className="w-20 h-20 bg-slate-900 rounded-3xl flex flex-col items-center justify-center shadow-2xl border border-white/10 relative group">
                  <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-teal-500/10 opacity-100 rounded-3xl" />
                  <LogoIcon size={44} variant="solid" />
                  <span className="text-[9px] font-sans font-bold text-white/80 mt-1">GoodSale</span>
                </div>
              </div>

              <div className="space-y-1">
                <h4 className="font-sans font-bold text-xs text-slate-900 dark:text-white">Mobile Springboard Layout</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Engineered with premium curves (squircle) to match iOS/Android standard aesthetics flawlessly.
                </p>
              </div>
            </div>

            {/* Favicon Mockup */}
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-slate-500 text-[9px] font-bold uppercase rounded font-mono">Website Favicon</span>
                <Laptop className="w-4 h-4 text-slate-400" />
              </div>

              <div className="bg-slate-100 dark:bg-slate-950 rounded-2xl h-48 flex items-center justify-center p-4">
                {/* Simulated Browser Tab */}
                <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg shadow-lg w-full px-3 py-2 flex items-center gap-2">
                  <div className="w-4 h-4 flex items-center justify-center text-emerald-500 bg-emerald-500/10 rounded">
                    <LogoIcon size={12} variant="solid" />
                  </div>
                  <span className="text-[10px] font-sans font-medium text-slate-700 dark:text-slate-300 truncate">GoodSale Nigeria | Escrow...</span>
                  <div className="w-3 h-3 rounded-full hover:bg-gray-100 text-gray-400 flex items-center justify-center text-[8px] font-bold font-mono ml-auto">×</div>
                </div>
              </div>

              <div className="space-y-1">
                <h4 className="font-sans font-bold text-xs text-slate-900 dark:text-white">Favicon & Tab System</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Clean, simplified 16×16px logo variant that remains sharp, legible, and recognizable in busy tab rails.
                </p>
              </div>
            </div>

            {/* Social Media Profile */}
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-slate-500 text-[9px] font-bold uppercase rounded font-mono">Social Profile</span>
                <ExternalLink className="w-4 h-4 text-slate-400" />
              </div>

              <div className="bg-slate-100 dark:bg-slate-950 rounded-2xl h-48 flex items-center justify-center">
                {/* Simulated Social Header Card */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow border border-gray-200 dark:border-slate-800 p-4 text-center space-y-2 max-w-xs w-full">
                  <div className="relative inline-block">
                    <div className="w-14 h-14 rounded-full bg-slate-900 flex items-center justify-center border-2 border-emerald-500 shadow-md">
                      <LogoIcon size={28} variant="solid" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-amber-500 text-white rounded-full p-0.5 border border-white">
                      <Award className="w-3 h-3" />
                    </div>
                  </div>
                  <div>
                    <h5 className="font-sans font-extrabold text-xs text-slate-900 dark:text-white">GoodSale Nigeria</h5>
                    <p className="text-[9px] text-gray-400 font-mono">@goodsale.ng</p>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <h4 className="font-sans font-bold text-xs text-slate-900 dark:text-white">Profile Identity Avatar</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Specially balanced within a circular viewport to highlight the central shield-bag logomark with high prestige.
                </p>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'collateral' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Packaging */}
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
                <div>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 text-[9px] font-bold uppercase rounded font-mono">Physical Product</span>
                  <h4 className="font-sans font-bold text-sm text-slate-950 dark:text-white mt-1">Premium Cardboard Packaging</h4>
                </div>
                <ImageIcon className="w-4 h-4 text-slate-400" />
              </div>

              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-950 border border-gray-100 dark:border-slate-800">
                <img 
                  src={packagingImg.src} 
                  alt="GoodSale Branded Premium Packaging Box" 
                  className="object-cover w-full h-full"
                  referrerPolicy="no-referrer"
                />
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Clean organic kraft boxes featuring the minimalist GoodSale shield stamp. Imparts immediate premium luxury and unboxing trust for merchant goods.
              </p>
            </div>

            {/* Delivery Uniforms */}
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
                <div>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 text-[9px] font-bold uppercase rounded font-mono">Apparel Spec</span>
                  <h4 className="font-sans font-bold text-sm text-slate-950 dark:text-white mt-1">Delivery Agent Uniforms</h4>
                </div>
                <ImageIcon className="w-4 h-4 text-slate-400" />
              </div>

              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-950 border border-gray-100 dark:border-slate-800">
                <img 
                  src={uniformImg.src} 
                  alt="GoodSale Branded Delivery Uniform Mockup" 
                  className="object-cover w-full h-full"
                  referrerPolicy="no-referrer"
                />
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Heavy-weight premium black cotton uniforms and caps. Features the embroidered GoodSale chest mark to project high security and authority on delivery runs.
              </p>
            </div>

            {/* Minimalist Business Cards */}
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
                <div>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 text-[9px] font-bold uppercase rounded font-mono">Corporate Collateral</span>
                  <h4 className="font-sans font-bold text-sm text-slate-950 dark:text-white mt-1">Executive Business Cards</h4>
                </div>
                <FileText className="w-4 h-4 text-slate-400" />
              </div>

              <div className="bg-slate-100 dark:bg-slate-950 rounded-2xl h-48 flex items-center justify-center p-4">
                {/* Front & Back Cards Stack */}
                <div className="relative w-72 h-36">
                  {/* Back of Card */}
                  <div className="absolute top-0 left-0 w-48 h-28 bg-slate-900 text-white rounded-xl shadow-xl border border-white/5 p-4 flex flex-col justify-between">
                    <LogoIcon size={24} variant="solid" />
                    <span className="text-[10px] font-mono tracking-[0.2em] text-gray-400">WWW.GOODSALE.NG</span>
                  </div>
                  {/* Front of Card */}
                  <div className="absolute bottom-0 right-0 w-48 h-28 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-2xl p-4 flex flex-col justify-between transform translate-x-2 translate-y-2">
                    <div className="flex items-center gap-1.5">
                      <LogoIcon size={16} variant="solid" />
                      <span className="font-sans font-bold text-[10px] text-slate-950 dark:text-white">GoodSale</span>
                    </div>
                    <div>
                      <h5 className="font-sans font-bold text-xs text-slate-950 dark:text-white">Adebayo Alao</h5>
                      <p className="text-[8px] text-gray-400">Managing Director, Escrow Operations</p>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Super-matte soft-touch luxury card stock with raised metallic foil detailing, designed to leave an unforgettable trust impression.
              </p>
            </div>

            {/* Billboards & Street Ads */}
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
                <div>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 text-[9px] font-bold uppercase rounded font-mono">Out-Of-Home Ads</span>
                  <h4 className="font-sans font-bold text-sm text-slate-950 dark:text-white mt-1">High-Impact City Billboards</h4>
                </div>
                <Grid className="w-4 h-4 text-slate-400" />
              </div>

              <div className="bg-slate-100 dark:bg-slate-950 rounded-2xl h-48 flex items-center justify-center p-4">
                {/* Simulated Billboard */}
                <div className="bg-slate-900 text-white rounded-xl shadow-2xl w-full h-full p-6 flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-transparent pointer-events-none" />
                  <Logo iconSize={24} textColorClass="text-white text-base" subtitleColorClass="text-emerald-400" />
                  
                  <div className="space-y-1 z-10">
                    <h3 className="font-sans font-black text-sm tracking-tight leading-none text-slate-100">
                      Nigeria&apos;s Secure Escrow Platform.
                    </h3>
                    <p className="text-[9px] text-emerald-400 font-mono">ZERO SCAMS. 100% VERIFIED TRUST.</p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Clean monochrome background formats optimized for outdoor legibility along expressways, focusing strictly on high-trust value messaging.
              </p>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
