'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { validateSurvey, VALID_FREQUENCIES } from '@/lib/survey/validation';
import { toE164 } from '@/lib/phoneE164';

/** Display grouping for NANP national digits (after fixed +1). */
function formatNanpNationalDisplay(digits) {
  const d = String(digits).replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

/** Build full number for validation/API: E.164 country code + national digits. */
function composeSurveyPhoneE164(countryCode, nationalDigits) {
  const nd = String(nationalDigits).replace(/\D/g, '');
  let cc = String(countryCode || '+1').trim();
  if (!cc.startsWith('+')) cc = `+${cc.replace(/\D/g, '')}`;
  else cc = `+${cc.slice(1).replace(/\D/g, '')}`;
  return `${cc}${nd}`;
}

// ══════════════════════════════════════════════
//  CANVAS HELPERS
// ══════════════════════════════════════════════
function mc(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
// ══════════════════════════════════════════════
//  SYMBOL SVGs — crisp vector icons
// ══════════════════════════════════════════════
const SYM_SVG = {
  seven: `<svg viewBox="0 0 56 64" xmlns="http://www.w3.org/2000/svg">
    <text x="28" y="52" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-style="italic" font-size="56"
      fill="#c62828" stroke="#3b0a0a" stroke-width="2.5" paint-order="stroke">7</text>
    <rect x="10" y="25" width="30" height="4" rx="1" fill="#fdd835" opacity=".55" transform="rotate(-8 25 27)"/>
  </svg>`,

  diamond: `<svg viewBox="0 0 48 52" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id="dc"><polygon points="24,2 46,18 24,50 2,18"/></clipPath>
      <style>@keyframes dshimmer{0%,100%{opacity:0;transform:translateX(-20px)}40%,60%{opacity:.55}50%{transform:translateX(28px)}}</style>
    </defs>
    <polygon points="24,2 46,18 24,50 2,18" fill="#4fc3f7" stroke="#0d47a1" stroke-width="2" stroke-linejoin="round"/>
    <line x1="2" y1="18" x2="46" y2="18" stroke="#0d47a1" stroke-width="1.2"/>
    <polyline points="15,18 24,2 33,18" fill="none" stroke="#0d47a1" stroke-width="1"/>
    <polyline points="15,18 24,50 33,18" fill="none" stroke="#0d47a1" stroke-width="1"/>
    <polygon points="24,2 33,18 24,18" fill="rgba(255,255,255,.28)"/>
    <polygon points="2,18 24,50 15,18" fill="rgba(255,255,255,.1)"/>
    <g clip-path="url(#dc)">
      <rect x="0" y="-2" width="14" height="56" rx="3" fill="rgba(255,255,255,.45)" style="animation:dshimmer 3s ease-in-out infinite" transform="rotate(15 24 26)"/>
    </g>
    <circle cx="30" cy="10" r="2.5" fill="rgba(255,255,255,.5)"><animate attributeName="opacity" values=".2;.7;.2" dur="2.2s" repeatCount="indefinite"/></circle>
    <circle cx="12" cy="22" r="1.5" fill="rgba(255,255,255,.4)"><animate attributeName="opacity" values=".1;.5;.1" dur="1.8s" repeatCount="indefinite"/></circle>
  </svg>`,

  bell: `<svg viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
    <path d="M24,8 C35,8 39,20 39,36 L41,40 L7,40 L9,36 C9,20 13,8 24,8Z" fill="#fbc02d" stroke="#5d4037" stroke-width="2" stroke-linejoin="round"/>
    <rect x="7" y="40" width="34" height="5" rx="2" fill="#f9a825" stroke="#5d4037" stroke-width="1.5"/>
    <circle cx="24" cy="50" r="3.5" fill="#f57f17" stroke="#5d4037" stroke-width="1.5"/>
    <rect x="21" y="2" width="6" height="7" rx="2" fill="#f9a825" stroke="#5d4037" stroke-width="1.5"/>
    <path d="M17,14 C18,14 19,26 19,38 L14,38 C14,26 15,14 17,14Z" fill="rgba(255,255,255,.18)"/>
  </svg>`,

  gold: `<svg viewBox="0 0 52 48" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="32" width="48" height="13" rx="2" fill="#f9a825" stroke="#5d4037" stroke-width="1.5"/>
    <rect x="6" y="19" width="40" height="13" rx="2" fill="#fbc02d" stroke="#5d4037" stroke-width="1.5"/>
    <rect x="10" y="6" width="32" height="13" rx="2" fill="#fdd835" stroke="#5d4037" stroke-width="1.5"/>
    <text x="26" y="15" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="7" fill="#5d4037" opacity=".5">GOLD</text>
  </svg>`,

  cherry: `<svg viewBox="0 0 48 52" xmlns="http://www.w3.org/2000/svg">
    <path d="M24,10 Q16,16 14,26" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M24,10 Q32,16 34,26" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M24,8 Q33,2 36,9 Q34,15 24,11Z" fill="#43a047" stroke="#2e7d32" stroke-width="1"/>
    <circle cx="14" cy="36" r="11" fill="#e53935" stroke="#7f1d1d" stroke-width="1.8"/>
    <circle cx="34" cy="36" r="11" fill="#e53935" stroke="#7f1d1d" stroke-width="1.8"/>
    <ellipse cx="10" cy="31" rx="3.5" ry="4.5" fill="rgba(255,255,255,.22)" transform="rotate(-20 10 31)"/>
    <ellipse cx="30" cy="31" rx="3.5" ry="4.5" fill="rgba(255,255,255,.22)" transform="rotate(-20 30 31)"/>
  </svg>`,

  bar: `<svg viewBox="0 0 52 36" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="48" height="32" rx="5" fill="#455a64" stroke="#1b2a33" stroke-width="2"/>
    <rect x="5" y="5" width="42" height="26" rx="3" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1"/>
    <text x="26" y="24" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="18"
      fill="#eceff1" stroke="#1b2a33" stroke-width=".6" paint-order="stroke">BAR</text>
  </svg>`,

  coin: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id="cc"><circle cx="24" cy="24" r="21"/></clipPath>
      <style>@keyframes cshimmer{0%,100%{opacity:0;transform:translateX(-22px)}40%,60%{opacity:.5}50%{transform:translateX(26px)}}</style>
    </defs>
    <circle cx="24" cy="24" r="21" fill="#fbc02d" stroke="#5d4037" stroke-width="2"/>
    <circle cx="24" cy="24" r="16" fill="none" stroke="#8d6e13" stroke-width="1.5"/>
    <text x="24" y="31" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="22" fill="#5d4037">$</text>
    <ellipse cx="17" cy="15" rx="8" ry="9" fill="rgba(255,255,255,.15)" transform="rotate(-25 17 15)"/>
    <g clip-path="url(#cc)">
      <rect x="0" y="-4" width="12" height="56" rx="3" fill="rgba(255,255,255,.4)" style="animation:cshimmer 3.5s ease-in-out infinite" transform="rotate(20 24 24)"/>
    </g>
    <circle cx="14" cy="12" r="2" fill="rgba(255,255,255,.45)"><animate attributeName="opacity" values=".15;.6;.15" dur="2s" repeatCount="indefinite"/></circle>
  </svg>`,
};

const SYMS = [
  { id:'seven',  w:4  },
  { id:'diamond',w:8  },
  { id:'bell',   w:12 },
  { id:'gold',   w:16 },
  { id:'cherry', w:18 },
  { id:'bar',    w:20 },
  { id:'coin',   w:22 },
];
const MULT5 = {}; // populated from config in component

// ══════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════
export default function SlotGame({ config }) {
  const {
    RTP: rtp,
    JACKPOT_RATE: jackpotRate,
    FOUR_OF_A_KIND_RATE: fourRate,
    START_CREDITS: startCredits,
    BONUS_CREDITS: bonusCredits,
    SYMBOL_WEIGHTS,
    PAYOUTS,
    BET_PRESETS,
    REEL_STOP_DELAYS,
    SLOT_UI,
    SURVEY_DEFAULT_COUNTRY_CODE: surveyCountryCode = '+1',
  } = config;

  const { SYM_H, STRIP, HYDRATION_DELAY_MS } = SLOT_UI;

  // Apply symbol weights and payouts from config
  SYMS.forEach(s => { s.w = SYMBOL_WEIGHTS[s.id] ?? s.w; });
  const TOTAL_W = SYMS.reduce((a,s) => a + s.w, 0);
  Object.assign(MULT5, PAYOUTS?.five_of_a_kind ?? { seven:100, diamond:50, bell:20, cherry:15, gold:10, bar:6, coin:3 });
  const PAYOUT_4 = PAYOUTS?.four_of_a_kind  ?? 4;
  const PAYOUT_3 = PAYOUTS?.three_of_a_kind ?? 2;

  // Game state
  const [credits, setCredits]   = useState(startCredits);
  const [hydrated, setHydrated] = useState(false);
  const [bet, setBetVal]        = useState(5);
  const [spins, setSpins]       = useState(0);
  const [wins, setWins]         = useState(0);
  const [bestWin, setBestWin]   = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winMsg, setWinMsg]     = useState('Spin to seek your fortune!');
  const [msgType, setMsgType]   = useState('idle');
  const [isMega, setIsMega]     = useState(false);
  const [surveyDone, setSurveyDone] = useState(false);
  const [modalOpen, setModalOpen]   = useState(false);

  // Survey form state
  const [formName, setFormName]       = useState('');
  const [formEmail, setFormEmail]     = useState('');
  /** National digits only (fixed country code shown separately in the UI). */
  const [formPhoneNationalDigits, setFormPhoneNationalDigits] = useState('');
  const [formFreq, setFormFreq]       = useState('');
  const [formConsent, setFormConsent] = useState(false);
  const [formErrors, setFormErrors]   = useState([]);
  const [submitting, setSubmitting]   = useState(false);
  const [surveyModalStep, setSurveyModalStep] = useState('form');
  const [formOtp, setFormOtp]       = useState('');
  const [verifying, setVerifying]     = useState(false);
  const [resending, setResending]   = useState(false);
  const [resendCooldownSec, setResendCooldownSec] = useState(0);

  // Canvas refs
  const bgCanvasRef      = useRef(null);
  const torchCanvasRef   = useRef(null);
  const particleCanvasRef= useRef(null);
  const coinAnimRef      = useRef(null);
  const gemRowRef        = useRef(null);
  const confettiRef      = useRef(null);
  const symsInitRef      = useRef(false);
  const creditsRef       = useRef(credits);
  const betRef           = useRef(bet);

  // Load credits from localStorage after hydration; survey state comes from HttpOnly cookie + server
  useEffect(() => {
    const saved = localStorage.getItem('th_credits');
    if (saved !== null) setCredits(parseInt(saved));

    fetch('/api/survey/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'include',
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.verified) {
          setSurveyDone(true);
          setSurveyModalStep('success');
        } else {
          setSurveyDone(false);
        }
      })
      .catch(() => {});

    const t = setTimeout(() => setHydrated(true), HYDRATION_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (resendCooldownSec <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldownSec(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldownSec]);

  // Persist credits on every change (only after hydration so we don't
  // overwrite the saved value with the default before it's been read)
  useEffect(() => {
    creditsRef.current = credits;
    if (hydrated) localStorage.setItem('th_credits', credits);
  }, [credits, hydrated]);
  useEffect(() => { betRef.current = bet; }, [bet]);




  // ── Init symbols (client-only) ──
  useEffect(() => {
    if (symsInitRef.current) return;
    symsInitRef.current = true;
    startCoinAnim('load-coin', 22);
    buildAllStrips();
    buildGemRow();
    buildCornerGems();
    buildPaytable();
    animateCoin();
    initBgCanvas();
    initTorchCanvas();
    initParticleCanvas();
  }, []);

  // strips are only built once on init — never rebuilt

  // ── Symbol helpers ──
  function pickRand() {
    let r = Math.random() * TOTAL_W, cum = 0;
    for (const s of SYMS) { cum += s.w; if (r < cum) return s.id; }
    return SYMS[SYMS.length - 1].id;
  }
  function makeCellEl(id) {
    const cell = document.createElement('div'); cell.className = 'sym-cell';
    cell.dataset.sym = id;
    cell.innerHTML = SYM_SVG[id] || '';
    return cell;
  }
  function buildAllStrips() {
    for (let i = 0; i < 5; i++) {
      const track = document.getElementById('rt' + i);
      if (!track) continue;
      track.innerHTML = '';
      for (let j = 0; j < STRIP; j++) {
        const cell = makeCellEl(pickRand());
        track.appendChild(cell);
      }
      track.style.transform = 'translateY(0px)';
      track.style.filter = 'none';
    }
  }

  // ── Gem row ──
  function buildGemRow() {
    const row = document.getElementById('gem-row'); if (!row) return;
    row.innerHTML = '';
    const colors = [[80,200,255],[255,100,80],[245,200,66],[255,100,80],[80,200,255]];
    const phases = [0, 0.8, 1.6, 2.4, 3.2];
    const canvases = colors.map((col, i) => {
      const cv = mc(20, 20); row.appendChild(cv);
      return { cv, col, phase: phases[i] };
    });
    let t = 0;
    function loop() {
      t += 0.04;
      canvases.forEach(({ cv, col, phase }) => {
        const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, 20, 20);
        const pulse = 0.7 + 0.3 * Math.sin(t + phase);
        const [r, g, b] = col;
        const grad = ctx.createLinearGradient(2, 1, 18, 19);
        grad.addColorStop(0, `rgba(255,255,255,${.9*pulse})`);
        grad.addColorStop(.3, `rgba(${r},${g},${b},${.9*pulse})`);
        grad.addColorStop(1, `rgba(${Math.round(r*.3)},${Math.round(g*.3)},${Math.round(b*.3)},${pulse})`);
        ctx.shadowColor = `rgba(${r},${g},${b},${.8*pulse})`; ctx.shadowBlur = 6*pulse;
        ctx.beginPath(); ctx.moveTo(10,1); ctx.lineTo(18,7); ctx.lineTo(10,19); ctx.lineTo(2,7); ctx.closePath();
        ctx.fillStyle = grad; ctx.fill(); ctx.shadowBlur = 0;
        ctx.save(); ctx.globalAlpha = .55*pulse; ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath(); ctx.moveTo(10,1); ctx.lineTo(13,7); ctx.lineTo(7,7); ctx.closePath(); ctx.fill(); ctx.restore();
      });
      requestAnimationFrame(loop);
    }
    loop();
  }

  // ── Corner gems ──
  function buildCornerGems() {
    const ids = ['cgem-tl','cgem-tr','cgem-bl','cgem-br'];
    const phases = [0, 1.2, 2.4, 3.6];
    let t = 0;
    function loop() {
      t += 0.03;
      ids.forEach((id, i) => {
        const cv = document.getElementById(id); if (!cv) return;
        const ctx = cv.getContext('2d'); ctx.clearRect(0,0,22,22);
        const pulse = 0.6 + 0.4*Math.abs(Math.sin(t+phases[i]));
        const cx=11, g=ctx.createRadialGradient(cx-2,cx-3,1,cx,cx,9);
        g.addColorStop(0,`rgba(220,255,255,${.95*pulse})`);
        g.addColorStop(.3,`rgba(80,210,255,${.9*pulse})`);
        g.addColorStop(1,`rgba(10,50,120,${pulse})`);
        ctx.shadowColor=`rgba(80,200,255,${.9*pulse})`; ctx.shadowBlur=8*pulse;
        ctx.beginPath();ctx.moveTo(cx,2);ctx.lineTo(19,8);ctx.lineTo(cx,20);ctx.lineTo(3,8);ctx.closePath();
        ctx.fillStyle=g;ctx.fill();ctx.shadowBlur=0;
        ctx.save();ctx.globalAlpha=.65*pulse;ctx.fillStyle='rgba(255,255,255,.9)';
        ctx.beginPath();ctx.moveTo(cx,2);ctx.lineTo(cx+3,8);ctx.lineTo(cx-3,8);ctx.closePath();ctx.fill();ctx.restore();
      });
      requestAnimationFrame(loop);
    }
    loop();
  }

  // ── Paytable ──
  function buildPaytable() {
    const grid = document.getElementById('ptgrid'); if (!grid) return;
    grid.innerHTML = '';
    const rows = [
      {sym:'seven',label:'7 × 5',mult:100},{sym:'diamond',label:'Diamond × 5',mult:50},
      {sym:'bell',label:'Bell × 5',mult:20},{sym:'cherry',label:'Cherry × 5',mult:15},
      {sym:'gold',label:'Gold × 5',mult:10},{sym:'bar',label:'BAR × 5',mult:6},
      {sym:null,label:'Any 4 match',mult:4},{sym:null,label:'Any 3 match',mult:2},
    ];
    rows.forEach(row => {
      const div=document.createElement('div');div.className='pt-row';
      const sym=document.createElement('span');sym.className='pt-sym';
      if(row.sym&&SYM_SVG[row.sym]){const ico=document.createElement('span');ico.className='pt-ico';ico.innerHTML=SYM_SVG[row.sym];sym.appendChild(ico);}
      const lbl=document.createElement('span');lbl.textContent=row.label;sym.appendChild(lbl);
      const mult=document.createElement('span');mult.className='pm';mult.textContent='×'+row.mult;
      div.appendChild(sym);div.appendChild(mult);grid.appendChild(div);
    });
  }

  // ── Coin animation (shared renderer) ──
  function startCoinAnim(id, size=12) {
    const cv = document.getElementById(id); if (!cv) return;
    const ctx = cv.getContext('2d'); const W=cv.width,H=cv.height; let t=0;
    let alive = true;
    function loop(){
      if(!alive) return;
      t+=.05;ctx.clearRect(0,0,W,H);
      const pulse=0.92+0.08*Math.sin(t);
      const cx=W/2,cy=H/2,r=size*pulse;
      ctx.shadowColor='rgba(240,180,0,.8)';ctx.shadowBlur=10;
      const g=ctx.createRadialGradient(cx-3,cy-4,1,cx,cy,r);
      g.addColorStop(0,'#fffce0');g.addColorStop(.35,'#f8c820');g.addColorStop(.7,'#c89000');g.addColorStop(1,'#805000');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      ctx.strokeStyle='rgba(160,110,0,.5)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(cx,cy,r-3,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#604000';ctx.font=`bold ${Math.round(size*.75*pulse)}px Georgia,serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('$',cx,cy+.5);
      const sg=ctx.createRadialGradient(cx-3,cy-4,1,cx-2,cy-3,r*.5);
      sg.addColorStop(0,'rgba(255,255,255,.8)');sg.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=sg;ctx.beginPath();ctx.arc(cx-2,cy-3,r*.45,0,Math.PI*2);ctx.fill();
      requestAnimationFrame(loop);
    }
    loop();
    return () => { alive = false; };
  }

  // ── Coin animation ──
  function animateCoin() {
    const cv = document.getElementById('coin-anim'); if (!cv) return;
    const ctx = cv.getContext('2d'); const W=cv.width,H=cv.height; let t=0;
    function loop(){
      t+=.05;ctx.clearRect(0,0,W,H);
      const pulse=0.92+0.08*Math.sin(t);
      const cx=W/2,cy=H/2,r=12*pulse;
      ctx.shadowColor='rgba(240,180,0,.8)';ctx.shadowBlur=8;
      const g=ctx.createRadialGradient(cx-3,cy-4,1,cx,cy,r);
      g.addColorStop(0,'#fffce0');g.addColorStop(.35,'#f8c820');g.addColorStop(.7,'#c89000');g.addColorStop(1,'#805000');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      ctx.strokeStyle='rgba(160,110,0,.5)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(cx,cy,r-3,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#604000';ctx.font=`bold ${10*pulse}px Georgia,serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('$',cx,cy+.5);
      const sg=ctx.createRadialGradient(cx-3,cy-4,1,cx-2,cy-3,r*.5);
      sg.addColorStop(0,'rgba(255,255,255,.8)');sg.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=sg;ctx.beginPath();ctx.arc(cx-2,cy-3,r*.45,0,Math.PI*2);ctx.fill();
      requestAnimationFrame(loop);
    }
    loop();
  }

  // ── Background canvas ──
  function initBgCanvas() {
    const cv = bgCanvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    function draw(){
      const W=window.innerWidth,H=window.innerHeight;cv.width=W;cv.height=H;
      ctx.fillStyle='#060402';ctx.fillRect(0,0,W,H);
      ctx.strokeStyle='rgba(255,200,100,.028)';ctx.lineWidth=1;
      const bw=60,bh=28;
      for(let row=0;row<Math.ceil(H/bh)+1;row++){
        const off=(row%2)*bw*.5;
        for(let col=-1;col<Math.ceil(W/bw)+1;col++){
          const x=col*bw+off,y=row*bh;
          ctx.fillStyle=`rgba(${12+Math.random()*.015*255},${9},${4},.6)`;ctx.fillRect(x+1,y+1,bw-2,bh-2);ctx.strokeRect(x,y,bw,bh);
        }
      }
    }
    draw();window.addEventListener('resize',draw);
  }

  // ── Torch canvas ──
  function initTorchCanvas() {
    const cv = torchCanvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    let W,H;
    function resize(){W=cv.width=window.innerWidth;H=cv.height=window.innerHeight;}
    resize();window.addEventListener('resize',resize);
    function fbm(x,t){return Math.sin(x*1.7+t*1.1)*.38+Math.sin(x*3.3+t*2.3)*.22+Math.sin(x*6.1-t*3.7)*.12+Math.sin(x*.9+t*.5)*.18;}
    function getTorchX(){const wrap=document.querySelector('.wrap');if(!wrap)return{lx:60,rx:W-60};const r=wrap.getBoundingClientRect();return{lx:Math.max(30,r.left-10),rx:Math.min(W-30,r.right+10)};}
    const FH=130,FW=44;
    function drawTorch(x,baseY,t,seed){
      const fA=0.5+0.35*(Math.sin(t*1.3+seed)*.5+.5)+0.15*(Math.sin(t*4.7+seed*1.4)*.5+.5);
      const gR=ctx.createRadialGradient(x,baseY-40,0,x,baseY-20,160);
      gR.addColorStop(0,`rgba(255,140,20,${.18*fA})`);gR.addColorStop(.3,`rgba(255,100,10,${.10*fA})`);gR.addColorStop(.6,`rgba(200,60,0,${.05*fA})`);gR.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=gR;ctx.fillRect(x-160,baseY-180,320,220);
      const wG=ctx.createLinearGradient(x-5,baseY,x+5,baseY);
      wG.addColorStop(0,'#3a2010');wG.addColorStop(.5,'#7a5028');wG.addColorStop(1,'#2a1408');
      ctx.fillStyle=wG;roundRectPath(ctx,x-5,baseY,10,54,2);ctx.fill();
      const brG=ctx.createLinearGradient(x-9,0,x+9,0);
      brG.addColorStop(0,'#5a4010');brG.addColorStop(.5,'#d4a020');brG.addColorStop(1,'#5a4010');
      ctx.fillStyle=brG;roundRectPath(ctx,x-9,baseY+50,18,8,2);ctx.fill();
      roundRectPath(ctx,x-9,baseY-4,18,8,2);ctx.fill();
      roundRectPath(ctx,x-11,baseY-10,22,14,3);ctx.fill();
      const eG=ctx.createRadialGradient(x,baseY-6,0,x,baseY-6,10*fA);
      eG.addColorStop(0,`rgba(255,240,180,${.95*fA})`);eG.addColorStop(.3,`rgba(255,160,30,${.8*fA})`);eG.addColorStop(1,'rgba(200,60,0,0)');
      ctx.fillStyle=eG;ctx.beginPath();ctx.ellipse(x,baseY-6,10*fA,7*fA,0,0,Math.PI*2);ctx.fill();
      ctx.save();ctx.beginPath();ctx.rect(x-FW/2-4,baseY-FH-10,FW+8,FH+16);ctx.clip();
      for(let ci=0;ci<FW;ci++){
        const nx=(ci/FW-.5)*2;const profile=Math.max(0,1-nx*nx*1.6);if(profile<.02)continue;
        const nv=fbm(ci/FW*3+seed,t);const colH=(FH-16)*profile*(0.78+0.22*nv);
        const cx2=x-FW/2+ci;const sy=baseY-8;const ey=sy-colH;if(ey>=sy)continue;
        const sg=ctx.createLinearGradient(cx2,sy,cx2,ey);
        sg.addColorStop(0,`rgba(255,255,200,${.95*fA*profile})`);sg.addColorStop(.12,`rgba(255,220,80,${.92*fA*profile})`);
        sg.addColorStop(.3,`rgba(255,140,20,${.85*fA*profile})`);sg.addColorStop(.55,`rgba(220,60,10,${.65*fA*profile})`);
        sg.addColorStop(.78,`rgba(160,20,0,${.35*fA*profile})`);sg.addColorStop(1,'rgba(80,0,0,0)');
        ctx.fillStyle=sg;const wOff=fbm(ci/FW*2+seed*1.5,t*1.4)*3*profile;ctx.fillRect(cx2+wOff,ey,1.4,colH);
      }
      const cG=ctx.createRadialGradient(x,baseY-12,0,x,baseY-FH*.3,FW*.22);
      cG.addColorStop(0,`rgba(255,255,230,${.9*fA})`);cG.addColorStop(.2,`rgba(255,210,60,${.7*fA})`);cG.addColorStop(.5,`rgba(255,120,10,${.4*fA})`);cG.addColorStop(1,'rgba(200,40,0,0)');
      ctx.fillStyle=cG;ctx.beginPath();ctx.ellipse(x,baseY-FH*.25,FW*.22,FH*.45,0,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    const embers=[];for(let i=0;i<40;i++)embers.push({side:i<20?'l':'r',x:0,y:0,vx:(Math.random()-.5)*.8,vy:-(Math.random()*.9+.3),life:Math.random(),maxLife:.8+Math.random()*.6,r:.8+Math.random()*1.4});
    let t=0;
    function loop(){
      t+=.018;ctx.clearRect(0,0,W,H);
      const {lx,rx}=getTorchX();const torchY=Math.round(H*.34);
      drawTorch(lx,torchY,t,0);drawTorch(rx,torchY,t,5.3);
      embers.forEach(e=>{
        e.life+=.016+Math.random()*.008;
        if(e.life>e.maxLife){const bx=e.side==='l'?lx:rx;e.x=bx+(Math.random()-.5)*8;e.y=torchY-10;e.vx=(Math.random()-.5)*1.1;e.vy=-(Math.random()*.8+.4);e.life=0;e.maxLife=.7+Math.random()*.5;return;}
        e.x+=e.vx;e.y+=e.vy;e.vx+=(Math.random()-.5)*.06;
        const pct=e.life/e.maxLife;const alpha=Math.max(0,(1-pct)*.9);const r=e.r*(1-pct*.4);
        const eg=Math.round(200*(1-pct)+30*pct);
        ctx.fillStyle=`rgba(255,${eg},0,${alpha})`;ctx.shadowColor=`rgba(255,160,20,${alpha*.8})`;ctx.shadowBlur=4;
        ctx.beginPath();ctx.arc(e.x,e.y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      });
      requestAnimationFrame(loop);
    }
    loop();
  }

  // ── Particle canvas ──
  function initParticleCanvas() {
    const cv = particleCanvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    let W,H;
    function resize(){W=cv.width=window.innerWidth;H=cv.height=window.innerHeight;}
    resize();window.addEventListener('resize',resize);
    const motes=[];for(let i=0;i<60;i++)motes.push({x:Math.random()*3000,y:Math.random()*3000,vx:(Math.random()-.5)*.15,vy:(Math.random()-.5)*.08+.04,r:.4+Math.random()*.9,alpha:Math.random()*.18+.04,dA:(Math.random()*.008+.003)*(Math.random()>.5?1:-1)});
    const sparks=[];for(let i=0;i<35;i++)sparks.push({x:Math.random()*3000,y:Math.random()*3000,vx:(Math.random()-.5)*.2,vy:Math.random()*.12+.02,size:.8+Math.random()*1.6,phase:Math.random()*Math.PI*2,speed:.04+Math.random()*.04,color:Math.random()>.5?[245,200,66]:[80,200,255]});
    function star4(x,y,r){ctx.beginPath();for(let i=0;i<4;i++){const a=i*Math.PI/2;ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);const a2=a+Math.PI/4;ctx.lineTo(x+Math.cos(a2)*r*.3,y+Math.sin(a2)*r*.3);}ctx.closePath();}
    let t=0;
    function loop(){
      t+=.016;ctx.clearRect(0,0,W,H);
      motes.forEach(m=>{m.x+=m.vx;m.y+=m.vy;m.alpha+=m.dA;if(m.alpha<.02||m.alpha>.22)m.dA*=-1;if(m.y>H+5){m.y=-5;m.x=Math.random()*W;}if(m.x<-5)m.x=W+5;if(m.x>W+5)m.x=-5;ctx.globalAlpha=m.alpha;ctx.fillStyle='rgba(220,180,100,1)';ctx.beginPath();ctx.arc(m.x,m.y,m.r,0,Math.PI*2);ctx.fill();});
      sparks.forEach(s=>{s.x+=s.vx;s.y+=s.vy;s.phase+=s.speed;if(s.y>H+5){s.y=-5;s.x=Math.random()*W;}const pulse=.5+.5*Math.sin(s.phase);const [r,g,b]=s.color;ctx.globalAlpha=pulse*.28;ctx.shadowColor=`rgba(${r},${g},${b},.8)`;ctx.shadowBlur=4*pulse;ctx.fillStyle=`rgba(${r},${g},${b},1)`;star4(s.x,s.y,s.size*(1+pulse*.4));ctx.fill();ctx.shadowBlur=0;});
      ctx.globalAlpha=1;requestAnimationFrame(loop);
    }
    loop();
  }

  // ══════════════════════════════════════════════
  //  GAME LOGIC
  // ══════════════════════════════════════════════
  function pickResult() {
    const isWin = Math.random() * 100 < rtp;
    const isJP  = isWin && Math.random() * 100 < jackpotRate;
    if (isJP) { const j=['bell','cherry','gold','bar','coin'][Math.floor(Math.random()*5)]; return [j,j,j,j,j]; }
    if (isWin) {
      const is4 = Math.random() * 100 < (fourRate ?? 15); const sym = pickRand();
      const res = [sym,sym,sym];
      for (let i=3;i<5;i++) { if (i<(is4?4:3)) res.push(sym); else { let s; do{s=pickRand();}while(s===sym); res.push(s); } }
      return res.sort(() => Math.random()-.5);
    }
    let tr=0;while(tr++<20){const res=Array.from({length:5},()=>pickRand());const cnt={};res.forEach(s=>{cnt[s]=(cnt[s]||0)+1;});if(Math.max(...Object.values(cnt))<3)return res;}
    return Array.from({length:5},()=>pickRand());
  }

  function spinEase(t) {
    if (t < .65) return t/.65;
    const p=(t-.65)/.35;return 1+.024*Math.sin(p*Math.PI*2.4)*Math.pow(1-p,2.3);
  }

  function animReel(idx, targetId, dur, onDone) {
    const track = document.getElementById('rt'+idx); if (!track) return;
    const cells = track.querySelectorAll('.sym-cell');
    const landIdx = STRIP-4;
    const landCell = cells[landIdx];
    if (landCell) {
      landCell.dataset.sym = targetId;
      landCell.innerHTML = SYM_SVG[targetId] || '';
    }
    const totalDist=(Math.floor(dur/180)*STRIP+landIdx)*SYM_H;
    const start=performance.now();let lastY=0;
    function frame(now){
      const t=Math.min((now-start)/dur,1);const eased=spinEase(t);
      const rawY=-(eased*totalDist);const y=((rawY%(STRIP*SYM_H))-(STRIP*SYM_H))%(STRIP*SYM_H);
      track.style.transform=`translateY(${y}px)`;
      const speed=Math.abs(y-lastY);
      track.style.filter=t<.7?`blur(${Math.min(speed*.22,4.5).toFixed(1)}px)`:`blur(${Math.max(0,2*(1-(t-.7)/.3)).toFixed(1)}px)`;
      lastY=y;
      if(t<1){requestAnimationFrame(frame);}
      else{
        track.style.filter='none';track.style.transform=`translateY(${-(landIdx*SYM_H)}px)`;
        const r=document.getElementById('r'+idx);if(r){r.style.borderColor='rgba(200,146,10,.55)';setTimeout(()=>{r.style.borderColor='';},75);}
        if(onDone) onDone();
      }
    }
    requestAnimationFrame(frame);
  }

  const SPIN_MSGS = [
    'The reels are turning...',
    'Fortune favours the bold...',
    'Seeking ancient treasure...',
    'The cave awakens...',
    'Gold dust in the air...',
    'Spinning the wheel of fate...',
    'Digging deep...',
    'The spirits stir...',
    'Your destiny unfolds...',
    'Ancient forces at work...',
    'The torches flicker...',
    'Riches await the brave...',
    'Unearthing the vault...',
    'The gold calls to you...',
    'Chasing the jackpot...',
  ];

  const IDLE_MSGS = [
    'Spin to seek your fortune!',
    'The treasure awaits...',
    'Will you be the one?',
    'Gold lies within these reels...',
    'Dare to spin again?',
    'The cave holds many secrets...',
    'Try your luck, adventurer!',
    'Riches beyond measure await...',
    'The ancient vault beckons...',
    'Fortune favours the fearless!',
  ];

  const MISS_MSGS = [
    'Not this time... spin again!',
    'So close! Try once more.',
    'The spirits demand another spin!',
    'Keep digging, treasure is near!',
    'Almost had it... go again!',
    'The vault stays sealed... for now.',
    'Dust and pebbles... spin again!',
    'No match — but luck is turning!',
    'The torches flicker... try again!',
    'The gods are watching. Spin!',
    'Empty-handed... but not for long!',
    'The cave teases... one more spin!',
    'Close, but the gold eludes you!',
    'Not yet, adventurer. Try again!',
    'Better luck next spin!',
  ];

  function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  const spinMsgRef = useRef(null);

  function startSpinMessages() {
    let idx = Math.floor(Math.random() * SPIN_MSGS.length);
    setWinMsg(SPIN_MSGS[idx]);
    setMsgType('spin');
    spinMsgRef.current = setInterval(() => {
      idx = (idx + 1) % SPIN_MSGS.length;
      setWinMsg(SPIN_MSGS[idx]);
    }, 600);
  }

  function stopSpinMessages() {
    if (spinMsgRef.current) { clearInterval(spinMsgRef.current); spinMsgRef.current = null; }
  }

  const doSpin = useCallback(() => {
    const currentCredits = creditsRef.current;
    const currentBet = betRef.current;
    if (currentCredits < currentBet) { setWinMsg('NOT ENOUGH GOLD'); setMsgType('miss'); setIsMega(false); return; }
    setSpinning(true);
    setCredits(c => c - currentBet);
    setSpins(s => s + 1);
    setWinMsg(randomFrom(SPIN_MSGS)); setMsgType('spin'); setIsMega(false);
    clearSparkles();
    clearPopouts();
    triggerBounce('.cval','bounce',450);
    triggerBounce('.stat:nth-child(1) .sv','bump',400);
    const outer = document.querySelector('.machine-outer');
    if (outer) outer.classList.add('spinning');
    startSpinMessages();
    const result = pickResult(); let done = 0;
    const durs = REEL_STOP_DELAYS ?? [860,1100,1340,1580,1820];
    for (let i=0;i<5;i++) animReel(i, result[i], durs[i], () => { done++; if(done===5) setTimeout(()=>finalizeResult(result,currentBet),80); });
  }, []);

  function triggerBounce(selector, cls, duration) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), duration);
  }

  function finalizeResult(result, usedBet) {
    stopSpinMessages();
    const outer = document.querySelector('.machine-outer');
    if (outer) outer.classList.remove('spinning');

    const cnt={}; result.forEach(s=>{cnt[s]=(cnt[s]||0)+1;});
    const max=Math.max(...Object.values(cnt));
    const top=Object.keys(cnt).find(k=>cnt[k]===max);
    let win=0,msg='',type='miss';
    if(max===5){win=usedBet*(MULT5[top]??100);msg=top==='seven'?'JACKPOT! +'+win:'FIVE OF A KIND! +'+win;type='mega';setIsMega(true);launchConfetti(120);sparkleWin(result,top);popoutWinSymbols(result,top);showCoinPop(win);}
    else if(max===4){win=usedBet*PAYOUT_4;msg='FOUR OF A KIND! +'+win;type='win4';setIsMega(false);launchConfetti(50);sparkleWin(result,top);popoutWinSymbols(result,top);showCoinPop(win);}
    else if(max===3){win=usedBet*PAYOUT_3;msg='THREE OF A KIND +'+win;type='win3';setIsMega(false);sparkleWin(result,top);popoutWinSymbols(result,top);}
    else{msg=randomFrom(MISS_MSGS);type='miss';setIsMega(false);}
    if(win>0){
      setCredits(c=>c+win);setWins(w=>w+1);
      setBestWin(b=>Math.max(b,win));
      flashReels(result,top);
      triggerBounce('.rw','win-flash',600);
      triggerBounce('.cval','win-bounce',600);
      setTimeout(() => {
        triggerBounce('.stat:nth-child(1) .sv','bump',400);
        triggerBounce('.stat:nth-child(2) .sv','bump',400);
        triggerBounce('.stat:nth-child(3) .sv','bump',400);
      }, 100);
    } else {
      triggerBounce('.cval','bounce',450);
    }
    setMsgType(type);
    setWinMsg(msg);
    setSpinning(false);
  }

  function flashReels(result,sym){result.forEach((s,i)=>{if(s===sym){const r=document.getElementById('r'+i);if(r){r.classList.add('win');setTimeout(()=>r.classList.remove('win'),1600);}}});}

  function sparkleWin(result,sym){
    const layer=document.getElementById('spl');const rwRect=document.getElementById('rw')?.getBoundingClientRect();
    if(!layer||!rwRect)return;
    result.forEach((s,i)=>{
      if(s!==sym)return;const reel=document.getElementById('r'+i);if(!reel)return;
      const rect=reel.getBoundingClientRect();const cx=rect.left-rwRect.left+rect.width/2;const cy=rect.top-rwRect.top+rect.height/2;
      for(let j=0;j<10;j++){
        const cv=mc(18,18);const ctx=cv.getContext('2d');
        const cols=[[245,200,66],[255,240,140],[80,210,255],[255,160,60]];const [r,g,b]=cols[Math.floor(Math.random()*cols.length)];
        ctx.shadowColor=`rgba(${r},${g},${b},.9)`;ctx.shadowBlur=5;ctx.fillStyle=`rgba(${r},${g},${b},1)`;
        ctx.beginPath();for(let k=0;k<4;k++){const a=k*Math.PI/2;ctx.lineTo(9+Math.cos(a)*7,9+Math.sin(a)*7);const a2=a+Math.PI/4;ctx.lineTo(9+Math.cos(a2)*2.5,9+Math.sin(a2)*2.5);}ctx.closePath();ctx.fill();
        const el=document.createElement('div');el.className='sp';
        const angle=Math.random()*360,dist=18+Math.random()*30;
        el.style.cssText=`left:${cx+Math.cos(angle*Math.PI/180)*dist-9}px;top:${cy+Math.sin(angle*Math.PI/180)*dist-9}px;animation-duration:${.5+Math.random()*.55}s;animation-delay:${Math.random()*.25}s;`;
        el.appendChild(cv);layer.appendChild(el);setTimeout(()=>el.remove(),1400);
      }
    });
  }
  function clearSparkles(){const l=document.getElementById('spl');if(l)l.innerHTML='';}

  function clearPopouts(){
    document.querySelectorAll('.popout-active').forEach(el=>el.classList.remove('popout-active'));
    document.querySelectorAll('.sym-cell.popout').forEach(el=>{
      el.classList.remove('popout','popout-bell','popout-coin','popout-diamond','popout-seven','popout-bar','popout-gold','popout-cherry');
    });
  }

  function popoutWinSymbols(result,sym){
    const landIdx=STRIP-4;
    result.forEach((s,i)=>{
      if(s!==sym)return;
      const track=document.getElementById('rt'+i);
      const reel=document.getElementById('r'+i);
      if(!track||!reel)return;
      const cell=track.querySelectorAll('.sym-cell')[landIdx];
      if(!cell)return;
      reel.classList.add('popout-active');
      cell.classList.add('popout','popout-'+sym);
      setTimeout(()=>{
        cell.classList.remove('popout','popout-'+sym);
        reel.classList.remove('popout-active');
      },2000);
    });
  }

  function launchConfetti(n){
    const layer=confettiRef.current;if(!layer)return;
    const palettes=[[245,200,66],[255,240,140],[80,210,255],[255,120,60],[200,255,160],[255,255,255]];
    for(let i=0;i<n;i++){
      const cv=mc(12,12);const ctx=cv.getContext('2d');const [r,g,b]=palettes[Math.floor(Math.random()*palettes.length)];
      ctx.fillStyle=`rgb(${r},${g},${b})`;
      if(Math.random()>.5){ctx.beginPath();for(let k=0;k<4;k++){const a=k*Math.PI/2;ctx.lineTo(6+Math.cos(a)*5,6+Math.sin(a)*5);ctx.lineTo(6+Math.cos(a+Math.PI/4)*2,6+Math.sin(a+Math.PI/4)*2);}ctx.closePath();ctx.fill();}
      else{ctx.beginPath();ctx.moveTo(6,1);ctx.lineTo(8,5);ctx.lineTo(11,5);ctx.lineTo(9,8);ctx.lineTo(10,12);ctx.lineTo(6,9);ctx.lineTo(2,12);ctx.lineTo(3,8);ctx.lineTo(1,5);ctx.lineTo(4,5);ctx.closePath();ctx.fill();}
      const el=document.createElement('div');el.className='cp';
      el.style.cssText=`left:${Math.random()*100}%;top:-14px;animation-duration:${.9+Math.random()*.9}s;animation-delay:${Math.random()*.45}s;`;
      el.appendChild(cv);layer.appendChild(el);setTimeout(()=>el.remove(),2500);
    }
  }

  function showCoinPop(amt){
    const el=document.createElement('div');el.className='coinpop';el.textContent=`+${amt}`;
    const btn=document.getElementById('sbtn');if(!btn)return;
    const r=btn.getBoundingClientRect();el.style.left=r.left+r.width/2-28+'px';el.style.top=r.top-10+'px';
    document.body.appendChild(el);setTimeout(()=>el.remove(),1000);
  }

  function setBet(v) { setBetVal(v); }

  async function openClaimModal() {
    try {
      const r = await fetch('/api/survey/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        credentials: 'include',
      });
      const data = await r.json();
      if (data.ok && data.verified) {
        setSurveyDone(true);
        setSurveyModalStep('success');
      } else {
        setSurveyModalStep('form');
      }
    } catch {
      setSurveyModalStep('form');
    }
    setFormErrors([]);
    setModalOpen(true);
  }

  // ── Survey submit ──
  async function handleSubmit() {
    const fullPhone = composeSurveyPhoneE164(surveyCountryCode, formPhoneNationalDigits);
    const errors = validateSurvey({ name:formName, email:formEmail, phone:fullPhone, frequency:formFreq, consent:formConsent });
    if (errors.length > 0) { setFormErrors(errors); return; }
    if (!toE164(fullPhone)) {
      setFormErrors(['Please enter a valid mobile number (10 digits after the country code).']);
      return;
    }
    setFormErrors([]); setSubmitting(true);
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name:formName, email:formEmail, phone:fullPhone, frequency:formFreq, consent:String(formConsent) }),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.status === 422) { setFormErrors(Array.isArray(data.errors) ? data.errors : [data.error || 'Please check your input.']); return; }
      if (res.status === 409) { setFormErrors([data.error]); return; }
      if (res.status === 429) { setFormErrors([data.error]); return; }
      if (!res.ok) { setFormErrors([data.error || 'Something went wrong. Please try again.']); return; }

      setFormOtp('');
      setResendCooldownSec(typeof data.otpCooldownSec === 'number' ? data.otpCooldownSec : 60);
      setSurveyModalStep('otp');
    } catch {
      setFormErrors(['Connection error. Please check your internet and try again.']);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp() {
    const code = formOtp.trim().replace(/\s/g, '');
    if (!/^\d{4,8}$/.test(code)) {
      setFormErrors(['Enter the verification code from your SMS (4–8 digits).']);
      return;
    }
    setFormErrors([]);
    setVerifying(true);
    try {
      const res = await fetch('/api/survey/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.status === 401) {
        setFormErrors([data.error || 'Session expired. Please submit the survey again.']);
        setSurveyModalStep('form');
        return;
      }
      if (res.status === 429) { setFormErrors([data.error]); return; }
      if (!res.ok) { setFormErrors([data.error || 'Verification failed.']); return; }

      setSurveyModalStep('success');
      setSurveyDone(true);
      setCredits(c => c + bonusCredits);
      launchConfetti(80);
    } catch {
      setFormErrors(['Connection error. Please try again.']);
    } finally {
      setVerifying(false);
    }
  }

  async function handleResendCode() {
    if (resendCooldownSec > 0 || resending || verifying) return;
    setFormErrors([]);
    setResending(true);
    try {
      const res = await fetch('/api/survey/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.status === 429 && data.retryAfterSec != null) {
        setResendCooldownSec(Number(data.retryAfterSec));
        setFormErrors([data.error || 'Please wait before resending.']);
        return;
      }
      if (!res.ok) {
        if (res.status === 401) {
          setFormErrors([data.error || 'Session expired. Please register again.']);
          setSurveyModalStep('form');
          return;
        }
        setFormErrors([data.error || 'Could not resend code.']);
        return;
      }
      if (typeof data.cooldownSec === 'number') setResendCooldownSec(data.cooldownSec);
    } catch {
      setFormErrors(['Connection error. Please try again.']);
    } finally {
      setResending(false);
    }
  }

  // ══════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════
  return (
    <>
      <canvas ref={bgCanvasRef}       id="canvas-bg"/>
      <canvas ref={torchCanvasRef}    id="canvas-torches"/>
      <canvas ref={particleCanvasRef} id="canvas-particles"/>
      <div className="cave-vignette"/>

      {/* Loading overlay — shown until credits are confirmed from localStorage */}
      {!hydrated && (
        <div className="load-overlay">
          <div className="load-box">
            <canvas id="load-coin" width="56" height="56"/>
            <div className="load-title">TREASURE HUNT</div>
            <div className="load-sub">Loading your vault...</div>
            <div className="load-bar-wrap">
              <div className="load-bar"/>
            </div>
          </div>
        </div>
      )}

      <div className="wrap">


        <div className="cbar">
          <canvas className="ccoin-wrap" id="coin-anim" width="28" height="28"/>
          <div>
            <div className="clabel">Gold</div>
            <div className="cval">{hydrated ? credits : '...'}</div>
          </div>
        </div>

        <div className="hero">
          <div className="hero-eyebrow">Ancient Riches Await</div>
          <h1>TREASURE<br/>HUNT</h1>
          <div className="gem-row" id="gem-row"/>
          <div className="divider-line">Spin For Free</div>
        </div>

        <div className="machine">
          <div className="corner-gem-wrap tl"><canvas id="cgem-tl" width="22" height="22"/></div>
          <div className="corner-gem-wrap tr"><canvas id="cgem-tr" width="22" height="22"/></div>
          <div className="corner-gem-wrap bl"><canvas id="cgem-bl" width="22" height="22"/></div>
          <div className="corner-gem-wrap br"><canvas id="cgem-br" width="22" height="22"/></div>
          <div className="machine-outer">
            <div className="filigree top">- - - - - - - - - - - - - - -</div>
            <div className="rw" id="rw">
              {[0,1,2,3,4].map(i => (
                <div className="reel" id={`r${i}`} key={i}>
                  <div className="reel-track" id={`rt${i}`}/>
                </div>
              ))}
              <div className="sparkle-layer" id="spl"/>
            </div>
            <div className="win-row">
              <div id="wmsg" className={`wmsg show ${msgType}${isMega?' mega':''}`}>{winMsg}</div>
            </div>
            <div className="filigree bot">- - - - - - - - - - - - - - -</div>
          </div>
        </div>

        <div className="controls">
          <div className="stone-panel">
            <div className="bet-top">
              <span className="bet-title">Wager</span>
              <span className="bet-display">{bet} gold</span>
            </div>
            <div className="bet-presets">
              {(BET_PRESETS ?? [1,5,10,15,25,50]).map(v => (
                <button key={v} className={`bp${bet===v?' act':''}`} onClick={()=>setBet(v)}>{v}</button>
              ))}
            </div>
          </div>

          <div className="spin-wrap">
            <button className="sbtn" id="sbtn" disabled={spinning || credits <= 0} onClick={doSpin}>
              {spinning ? 'SPINNING...' : 'SPIN TO WIN'}
            </button>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat"><div className="sl">Spins</div><div className="sv">{spins}</div></div>
          <div className="stat"><div className="sl">Wins</div><div className="sv">{wins}</div></div>
          <div className="stat"><div className="sl">Best Win</div><div className="sv">{bestWin}</div></div>
        </div>

        {!surveyDone && (
          <div className={`survey-banner${credits <= 0 ? ' highlight' : ''}`}>
            <div className="sb-text">
              <div className="sb-title">{credits <= 0 ? 'Out of Gold! Claim Now' : 'Claim Bonus Gold'}</div>
              <div className="sb-sub">Take a quick survey &amp; earn <strong>{bonusCredits} bonus gold</strong> instantly</div>
            </div>
            <button className="signup-btn" onClick={openClaimModal}>Claim<br/>Reward</button>
          </div>
        )}

        <div className="paytable">
          <div className="pt-title">Treasure Table</div>
          <div className="pt-grid" id="ptgrid"/>
        </div>



        <div className="footer">
          Free game for entertainment only. No purchase required.<br/>
          Gold credits have no cash value. Must be 18+ to play.<br/>
          <Link href="/terms">Terms &amp; Conditions</Link> &nbsp;|&nbsp; <Link href="/privacy">Privacy Policy</Link>
        </div>
      </div>

      <div className="clayer" ref={confettiRef}/>

      {/* SURVEY MODAL */}
      <div className={`modal-overlay${modalOpen?' open':''}`}>
        <div className="modal">
          {surveyModalStep === 'success' ? (
            <div className="success-state show">
              <div className="success-title">Thank You!</div>
              <div className="modal-divider">Verified</div>
              <div className="success-sub">
                Your number is verified and your response is saved.<br/>
                Thank you.
              </div>
              <div className="success-sub" style={{ marginTop: '12px' }}>Gold added to your chest:</div>
              <div className="bonus-pill">+{bonusCredits} Gold</div>
              <div className="helpline-card" style={{display:'none'}}>
                <div className="helpline-title">Support Resources</div>
                <div className="helpline-item">
                  <div className="helpline-name">National Problem Gambling Helpline (US)</div>
                  <a className="helpline-num" href="tel:18005224700">1-800-522-4700</a>
                </div>
                <div className="helpline-item">
                  <div className="helpline-name">GamCare Helpline (UK)</div>
                  <a className="helpline-num" href="tel:08088020133">0808 802 0133</a>
                </div>
                <div className="helpline-item">
                  <div className="helpline-name">Online resources</div>
                  <a className="helpline-link" href="https://www.ncpgambling.org" target="_blank" rel="noreferrer">ncpgambling.org</a>
                  &nbsp;&middot;&nbsp;
                  <a className="helpline-link" href="https://www.gamcare.org.uk" target="_blank" rel="noreferrer">gamcare.org.uk</a>
                </div>
              </div>
              <div className="success-sub" style={{fontSize:'10px',color:'#6a5020'}}>Gold credits have no cash value and are for game use only.</div>
              <button className="submit-btn" style={{marginTop:'16px'}} onClick={()=>setModalOpen(false)}>Continue Quest</button>
            </div>
          ) : surveyModalStep === 'otp' ? (
            <div className="form-state" id="otp-state">
              <div className="modal-title">Check your phone</div>
              <div className="modal-divider">Enter verification code</div>
              <div className="modal-sub">
                We sent a code to the number you provided.<br/>
                Enter it below to verify and claim your bonus.
              </div>
              {formErrors.length > 0 && (
                <div className="error-box">
                  {formErrors.map((e,i) => <div key={i}>{e}</div>)}
                </div>
              )}
              <div className="field">
                <label>Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={formOtp}
                  onChange={e => setFormOtp(e.target.value.replace(/[^\d\s]/g, ''))}
                />
              </div>
              <button className="submit-btn" disabled={verifying} onClick={handleVerifyOtp}>
                {verifying ? 'Verifying...' : 'Verify & claim bonus'}
              </button>
              <button
                type="button"
                className="submit-btn"
                style={{ marginTop: '10px', opacity: 0.85 }}
                disabled={verifying || resending || resendCooldownSec > 0}
                onClick={handleResendCode}
              >
                {resending
                  ? 'Sending...'
                  : resendCooldownSec > 0
                    ? `Resend code (${resendCooldownSec}s)`
                    : 'Resend code'}
              </button>
              <button
                type="button"
                className="submit-btn"
                style={{ marginTop: '10px', opacity: 0.85 }}
                disabled={verifying || resending}
                onClick={() => {
                  setSurveyModalStep('form');
                  setFormOtp('');
                  setFormErrors([]);
                }}
              >
                Back
              </button>
            </div>
          ) : (
            <div className="form-state" id="form-state">
              <div className="modal-title">Claim Your Gold</div>
              <div className="modal-divider">Gaming Survey</div>
              <div className="modal-sub">Complete this survey &amp; receive<br/><strong>{bonusCredits} bonus gold</strong> added to your chest</div>
              <div className="survey-note" style={{display:'none'}}>
                <strong>About this survey</strong>
                This survey collects your name, email, and phone number so we can follow up with relevant gambling support resources and helpline information if appropriate.
                <strong style={{color:'#d4a840'}}> This survey is not anonymous.</strong> Your contact details will be used to send you support information. Participation is completely voluntary and you may withdraw at any time. We will never sell your data to third parties.
              </div>

              {formErrors.length > 0 && (
                <div className="error-box">
                  {formErrors.map((e,i) => <div key={i}>{e}</div>)}
                </div>
              )}

              <div className="field">
                <label>Full name</label>
                <input type="text" placeholder="Your full name" autoComplete="name"
                  value={formName} onChange={e=>setFormName(e.target.value)}/>
              </div>
              <div className="field">
                <label>Email address</label>
                <input type="email" placeholder="you@example.com" autoComplete="email"
                  value={formEmail} onChange={e=>setFormEmail(e.target.value)}/>
              </div>
              <div className="field">
                <label htmlFor="survey-phone-national">Phone number</label>
                <div className="phone-input-wrap" role="group" aria-label="Phone number">
                  <span className="phone-cc">{surveyCountryCode}</span>
                  <input
                    id="survey-phone-national"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="555 000 0000"
                    aria-describedby="survey-phone-hint"
                    value={formatNanpNationalDisplay(formPhoneNationalDigits)}
                    onChange={(e) => {
                      const d = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setFormPhoneNationalDigits(d);
                    }}
                  />
                </div>          
              </div>
              <div className="field">
                <label>How often do you play online games?</label>
                <select value={formFreq} onChange={e=>setFormFreq(e.target.value)}>
                  <option value="">— select —</option>
                  {VALID_FREQUENCIES.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div className="consent-row">
                <input type="checkbox" id="f-consent" checked={formConsent} onChange={e=>setFormConsent(e.target.checked)}/>
                <label htmlFor="f-consent">
                  I consent to being contacted about my submission and and to the use of my survey data as described in our <Link href="/privacy">Privacy Policy</Link>.
                </label>
              </div>
              <button className="submit-btn" disabled={submitting} onClick={handleSubmit}>
                {submitting ? 'Submitting...' : 'Claim Bonus & Submit'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}