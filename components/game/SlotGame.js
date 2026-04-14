'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { forceAcceptConsent } from '@/components/game/CookieConsent';

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
//  Reel symbols — assets in /public/game/ (chest.svg is UI-only on chests, not a reel icon)
// ══════════════════════════════════════════════
const SYM_GAME_FILES = {
  key: 'key.svg',
  crystal: 'diamond.svg',
  map: 'map.svg',
  compass: 'compass.svg',
  shield: 'shield.svg',
  scroll: 'scroll.svg',
  star: 'star.svg',
};
const SYM_ALT = {
  key: 'Key',
  crystal: 'Crystal',
  map: 'Map',
  compass: 'Compass',
  shield: 'Shield',
  scroll: 'Scroll',
  star: 'Star',
};
const SYM_SVG = Object.fromEntries(
  Object.entries(SYM_GAME_FILES).map(([id, file]) => [
    id,
    `<img src="/game/${file}" alt="${SYM_ALT[id] ?? id}"/>`,
  ]),
);

const SYMS = [
  { id: 'key',     w: 28 },
  { id: 'crystal', w: 24 },
  { id: 'map',     w: 20 },
  { id: 'compass', w: 16 },
  { id: 'shield',  w: 12 },
  { id: 'scroll',  w: 9 },
  { id: 'star',    w: 6 },
];

/** Per-symbol bet multipliers for a 5-match (treasure find). */
const TREASURE_FIND_MULT = {};

/** Rules popup: full-row payout flavor per symbol (mult comes from live config). */
const RULES_FULL_ROW_FLAVOR = {
  key: m =>
    `One key is a whisper; five keys are a chorus. The vault tallies ${m}× the coins you spent on that search—every latch turned at once.`,
  crystal: m =>
    `A chandelier of matching crystals across the row is worth ${m}× your coins-per-search: the kind of dazzle that makes the whole cave lean in.`,
  map: m =>
    `When every crewmate's chart shows the same coastline, the island pays ${m}× the coins that search cost you. Ink agrees, and the treasure stops pretending to hide.`,
  compass: m =>
    `Five needles swinging to the same bearing spin ${m}× the coins you paid for that explore back into your purse—true north, paid in gold.`,
  shield: m =>
    `A wall of identical shields is ${m}× your search spend: less a skirmish, more a coronation with confetti you can spend.`,
  scroll: m =>
    `Duplicate seals on every decree mean the treasury owes you ${m}× the coins you spent that round—history pays compound interest.`,
  star: m =>
    `The same constellation stamped on every lid pays ${m}× the coins you spent on that search, as if the night sky co-signed the receipt.`,
};
function rulesFullRowFlavor(id, name, mult) {
  const fn = RULES_FULL_ROW_FLAVOR[id];
  return fn ? fn(mult) : `Five ${name} symbols in a row return ${mult} times the coins you spent on that search.`;
}

// ══════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════
export default function SlotGame({ config }) {
  const {
    EXPLORE_HIT_PCT: exploreHitPct,
    BONUS_LINE_PCT: bonusLinePct,
    STREAK_FOUR_PCT: streakFourPct,
    START_CREDITS: startCredits,
    BONUS_CREDITS: bonusCredits,
    RELIC_DEPTH: relicDepth,
    FIND_PAYOUTS,
    SEARCH_COST_PRESETS,
    CHEST_PULSE_MS: chestPulseMs,
    SLOT_UI,
  } = config;

  const { HYDRATION_DELAY_MS } = SLOT_UI;

  const costPresets = useMemo(() => {
    const p = SEARCH_COST_PRESETS;
    return Array.isArray(p) && p.length > 0 ? p : [1, 5, 10, 15, 25, 50];
  }, [SEARCH_COST_PRESETS]);

  // Relic depth: higher → rarer reel (1/w probability) and higher treasure-find multiplier.
  SYMS.forEach(s => { s.w = relicDepth[s.id] ?? s.w; });
  const invWeights = SYMS.map(s => ({ id: s.id, inv: 1 / Math.max(s.w, 1e-9) }));
  const TOTAL_INV_REEL = invWeights.reduce((a, x) => a + x.inv, 0);
  const wMin = Math.min(...SYMS.map(s => s.w));
  const wMax = Math.max(...SYMS.map(s => s.w));
  const TREASURE_MIN = 3;
  const TREASURE_MAX = 100;
  for (const s of SYMS) {
    TREASURE_FIND_MULT[s.id] =
      wMax > wMin
        ? Math.round(TREASURE_MIN + ((s.w - wMin) / (wMax - wMin)) * (TREASURE_MAX - TREASURE_MIN))
        : Math.round((TREASURE_MIN + TREASURE_MAX) / 2);
  }
  const GREAT_FIND_MULT = FIND_PAYOUTS?.great_find ?? 4;
  const GOOD_FIND_MULT = FIND_PAYOUTS?.good_find ?? 2;

  const rulesTreasureRows = [...SYMS]
    .map(s => ({
      id: s.id,
      name: SYM_ALT[s.id] ?? s.id,
      mult: TREASURE_FIND_MULT[s.id],
    }))
    .sort((a, b) => b.mult - a.mult || String(a.name).localeCompare(String(b.name)));

  // Game state
  const [credits, setCredits]   = useState(startCredits);
  const [hydrated, setHydrated] = useState(false);
  const [bet, setBetVal]        = useState(5);
  const [spins, setSpins]       = useState(0);
  const [wins, setWins]         = useState(0);
  const [bestWin, setBestWin]   = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winMsg, setWinMsg]     = useState('Play to seek your treasure!');
  const [msgType, setMsgType]   = useState('idle');
  const [isMega, setIsMega]     = useState(false);
  const [surveyDone, setSurveyDone] = useState(false);
  const [rulesOpen, setRulesOpen]   = useState(false);

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
        } else {
          setSurveyDone(false);
        }
      })
      .catch(() => {});

    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq('track', 'ViewContent');
    }

    const t = setTimeout(() => setHydrated(true), HYDRATION_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Persist credits on every change (only after hydration so we don't
  // overwrite the saved value with the default before it's been read)
  useEffect(() => {
    creditsRef.current = credits;
    if (hydrated) localStorage.setItem('th_credits', credits);
  }, [credits, hydrated]);
  useEffect(() => { betRef.current = bet; }, [bet]);

  useEffect(() => {
    if (!costPresets.includes(bet)) setBetVal(costPresets[0]);
  }, [costPresets, bet]);

  useEffect(() => {
    if (!rulesOpen) return undefined;
    const onKey = e => {
      if (e.key === 'Escape') setRulesOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rulesOpen]);


  // ── Init symbols (client-only) ──
  useEffect(() => {
    if (symsInitRef.current) return;
    symsInitRef.current = true;
    startCoinAnim('load-coin', 22);
    initChests();
    buildGemRow();
    animateCoin();
    initBgCanvas();
    initTorchCanvas();
    initParticleCanvas();
  }, []);

  // ── Symbol helpers ──
  function pickRand() {
    let r = Math.random() * TOTAL_INV_REEL;
    let cum = 0;
    for (const { id, inv } of invWeights) {
      cum += inv;
      if (r < cum) return id;
    }
    return SYMS[SYMS.length - 1].id;
  }
  function initChests() {
    for (let i = 0; i < 5; i++) {
      const chest = document.getElementById('r' + i);
      const reveal = document.getElementById('rt' + i);
      if (!chest || !reveal) continue;
      chest.classList.remove('shaking', 'opening', 'unlocking', 'win', 'win-pop', 'compass-win');
      reveal.innerHTML = '';
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
      ctx.fillStyle='#604000';ctx.font=`bold ${Math.round(size*.75*pulse)}px Georgia,serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('★',cx,cy+.5);
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
      ctx.fillStyle='#604000';ctx.font=`bold ${10*pulse}px Georgia,serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('★',cx,cy+.5);
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
    const isWin = Math.random() * 100 < exploreHitPct;
    const isRareFindLine = isWin && Math.random() * 100 < bonusLinePct;
    if (isRareFindLine) {
      const j = ['key', 'crystal', 'map', 'shield', 'scroll', 'star'][Math.floor(Math.random() * 6)];
      return [j, j, j, j, j];
    }
    if (isWin) {
      const is4 = Math.random() * 100 < (streakFourPct ?? 15); const sym = pickRand();
      const res = [sym,sym,sym];
      for (let i=3;i<5;i++) { if (i<(is4?4:3)) res.push(sym); else { let s; do{s=pickRand();}while(s===sym); res.push(s); } }
      return res.sort(() => Math.random()-.5);
    }
    let tr=0;while(tr++<20){const res=Array.from({length:5},()=>pickRand());const cnt={};res.forEach(s=>{cnt[s]=(cnt[s]||0)+1;});if(Math.max(...Object.values(cnt))<3)return res;}
    return Array.from({length:5},()=>pickRand());
  }

  function animChest(idx, targetId, dur, onDone) {
    const chest = document.getElementById('r' + idx);
    const reveal = document.getElementById('rt' + idx);
    if (!chest || !reveal) return;
    chest.classList.remove('opening', 'unlocking', 'win', 'win-pop', 'compass-win');
    reveal.innerHTML = '';
    chest.classList.add('shaking');
    setTimeout(() => {
      chest.classList.remove('shaking');
      chest.classList.add('unlocking');
      setTimeout(() => {
        chest.classList.remove('unlocking');
        reveal.innerHTML = SYM_SVG[targetId] || '';
        void reveal.offsetWidth;
        chest.classList.add('opening');
        if (onDone) setTimeout(onDone, 550);
      }, 480);
    }, dur);
  }

  const SPIN_MSGS = [
    'The chests are rattling...',
    'Bold explorers press on...',
    'Seeking ancient treasure...',
    'The cave awakens...',
    'Gold dust in the air...',
    'Ancient locks trembling...',
    'Digging deep...',
    'The spirits stir...',
    'Your destiny unfolds...',
    'Ancient forces at work...',
    'The torches flicker...',
    'Riches await the brave...',
    'Unearthing the vault...',
    'The gold calls to you...',
    'Chasing the legend...',
  ];

  const IDLE_MSGS = [
    'Play to seek your treasure!',
    'What will you discover?',
    'The treasure awaits...',
    'Will you be the one?',
    'Secrets lie within these chests...',
    'Dare to explore again?',
    'The cave holds many secrets...',
    'Onward, adventurer!',
    'Wonders beyond measure await...',
    'The ancient vault beckons...',
    'The fearless find more...',
  ];

  const MISS_MSGS = [
    'Not this time... play again!',
    'So close! Try once more.',
    'The spirits demand another play!',
    'Keep digging, treasure is near!',
    'Almost had it... go again!',
    'The vault stays sealed... for now.',
    'Dust and pebbles... play again!',
    'No match — but luck is turning!',
    'The torches flicker... try again!',
    'The gods are watching. Play!',
    'Empty-handed... but not for long!',
    'The cave teases... one more play!',
    'Close, but the gold eludes you!',
    'Not yet, adventurer. Try again!',
    'Better luck next play!',
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
    if (currentCredits < currentBet) { setWinMsg('NOT ENOUGH COINS FOR THIS SEARCH'); setMsgType('miss'); setIsMega(false); return; }
    setSpinning(true);
    setCredits(c => c - currentBet);
    setSpins(s => s + 1);
    setWinMsg(randomFrom(SPIN_MSGS)); setMsgType('spin'); setIsMega(false);
    clearSparkles();
    clearPopouts();
    triggerBounce('.cval','bounce',450);
    triggerBounce('.stat:nth-child(1) .sv','bump',400);
    const outer = document.querySelector('.hunt-frame-outer');
    if (outer) outer.classList.add('spinning');
    startSpinMessages();
    const result = pickResult(); let done = 0;
    const durs = chestPulseMs ?? [860, 1100, 1340, 1580, 1820];
    for (let i=0;i<5;i++) animChest(i, result[i], durs[i], () => { done++; if(done===5) setTimeout(()=>finalizeResult(result,currentBet),80); });
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
    const outer = document.querySelector('.hunt-frame-outer');
    if (outer) outer.classList.remove('spinning');

    const cnt={}; result.forEach(s=>{cnt[s]=(cnt[s]||0)+1;});
    const max=Math.max(...Object.values(cnt));
    const top=Object.keys(cnt).find(k=>cnt[k]===max);
    let win=0,msg='',type='miss';
    if(max===5){win=usedBet*(TREASURE_FIND_MULT[top]??TREASURE_MAX);msg='TREASURE FIND! +'+win;type='treasure_find';setIsMega(true);launchConfetti(120);sparkleWin(result,top);popoutWinSymbols(result,top);showCoinPop(win);}
    else if(max===4){win=usedBet*GREAT_FIND_MULT;msg='GREAT FIND! +'+win;type='great_find';setIsMega(false);launchConfetti(50);sparkleWin(result,top);popoutWinSymbols(result,top);showCoinPop(win);}
    else if(max===3){win=usedBet*GOOD_FIND_MULT;msg='GOOD FIND! +'+win;type='good_find';setIsMega(false);sparkleWin(result,top);popoutWinSymbols(result,top);}
    else{msg=randomFrom(MISS_MSGS);type='miss';setIsMega(false);}
    if(win>0){
      setCredits(c=>c+win);setWins(w=>w+1);
      setBestWin(b=>Math.max(b,win));
      flashReels(result,top);
      tagCompassCelebration(result, top, max);
      triggerBounce('.chest-row','win-flash',600);
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

  /** 3+ compass: mark winning chests so CSS can scale+spin the revealed compass */
  function tagCompassCelebration(result, topSym, maxMatch) {
    if (topSym !== 'compass' || maxMatch < 3) return;
    result.forEach((s, i) => {
      if (s !== topSym) return;
      document.getElementById('r' + i)?.classList.add('compass-win');
    });
    setTimeout(() => {
      document.querySelectorAll('.chest.compass-win').forEach((el) => el.classList.remove('compass-win'));
    }, 2200);
  }

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
    document.querySelectorAll('.win-pop').forEach(el=>el.classList.remove('win-pop'));
    document.querySelectorAll('.compass-win').forEach(el=>el.classList.remove('compass-win'));
  }

  function popoutWinSymbols(result,sym){
    result.forEach((s,i)=>{
      if(s!==sym)return;
      const chest=document.getElementById('r'+i);
      if(!chest)return;
      chest.classList.add('win-pop');
      setTimeout(()=>chest.classList.remove('win-pop'),2000);
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
    const btn=document.getElementById('hunt-action-btn');if(!btn)return;
    const r=btn.getBoundingClientRect();el.style.left=r.left+r.width/2-28+'px';el.style.top=r.top-10+'px';
    document.body.appendChild(el);setTimeout(()=>el.remove(),1000);
  }

  function setBet(v) { setBetVal(v); }

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
            <div className="clabel">Coins</div>
            <div className="cval">{hydrated ? credits : '...'}</div>
          </div>
        </div>

        <div className="hero">
          <div className="hero-eyebrow">Ancient Secrets Await</div>
          <h1>TREASURE<br/>HUNT</h1>
          <div className="gem-row" id="gem-row"/>
          <div className="divider-line">Begin Your Quest</div>
        </div>

        <div className="hunt-frame">
          <div className="hunt-frame-outer">
            <div className="chest-row" id="rw">
              {[0,1,2,3,4].map(i => (
                <div className="chest" id={`r${i}`} key={i}>
                  <div className="chest-lid" id={`lid${i}`}/>
                  <div className="chest-key"/>
                  <div className="chest-body"/>
                  <div className="chest-reveal" id={`rt${i}`}/>
                </div>
              ))}
              <div className="sparkle-layer" id="spl"/>
            </div>
            <div className="win-row">
              <div id="wmsg" className={`wmsg show ${msgType}${isMega?' mega':''}`}>{winMsg}</div>
            </div>
          </div>
        </div>

        <div className="controls">
          <div className="stone-panel search-cost-panel">
            <div className="cost-label search-cost-label" id="search-cost-label">
              Coins per search
            </div>
            <div
              className="bet-presets"
              role="radiogroup"
              aria-labelledby="search-cost-label"
              aria-label="Coins spent each time you explore"
            >
              {costPresets.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={bet === v}
                  className={`bp${bet === v ? ' act' : ''}`}
                  onClick={() => setBet(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="search-action-wrap">
            <button className="hunt-action-btn" id="hunt-action-btn" disabled={spinning || credits <= 0} onClick={doSpin}>
              {spinning ? 'SEARCHING...' : 'EXPLORE'}
            </button>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat"><div className="sl">Searches</div><div className="sv">{spins}</div></div>
          <div className="stat"><div className="sl">Finds</div><div className="sv">{wins}</div></div>
          <div className="stat"><div className="sl">Best Find</div><div className="sv">{bestWin}</div></div>
        </div>

        <div className="rules-trigger-wrap">
          <button
            type="button"
            className="rules-trigger-btn"
            onClick={() => setRulesOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={rulesOpen}
          >
            Rules to find your treasure
          </button>
        </div>

        {!surveyDone && (
          <div className={`survey-banner${credits <= 0 ? ' highlight' : ''}`}>
            <div className="sb-text">
              <div className="sb-title">{credits <= 0 ? 'Out of coins? Unlock more' : 'Unlock bonus coins'}</div>
              <div className="sb-sub">
                Take a quick survey and <strong>unlock {bonusCredits} bonus coins</strong> for your quest.
              </div>
            </div>
            <Link
              href="/survey"
              prefetch
              className="signup-btn"
              onClick={() => forceAcceptConsent()}
            >
              Get coins
            </Link>
          </div>
        )}

        <div className="footer">
          Free game for entertainment only. No purchase required.<br/>
          Coin credits have no cash value. Must be 21+ to play.<br/>
          <Link href="/terms">Terms &amp; Conditions</Link> &nbsp;|&nbsp; <Link href="/privacy">Privacy Policy</Link>
        </div>
      </div>

      <div className="clayer" ref={confettiRef}/>

      {/* RULES POPUP */}
      <div
        className={`rules-overlay${rulesOpen ? ' open' : ''}`}
        role="presentation"
        onClick={() => setRulesOpen(false)}
      >
        <div
          className="rules-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rules-dialog-title"
          onClick={e => e.stopPropagation()}
        >
          <div className="rules-dialog-head">
            <h2 id="rules-dialog-title" className="rules-dialog-title">
              Rules to find your treasure
            </h2>
            <button
              type="button"
              className="rules-close"
              onClick={() => setRulesOpen(false)}
              aria-label="Close rules"
            >
              ×
            </button>
          </div>
          <div className="rules-prose">
            <p className="rules-lede">
              Press <strong>Explore</strong> and the chests spill their relics. Your <strong>Coins per search</strong>{' '}
              sets how many coins each explore uses; dial it up or down and every reward below scales the same way, so
              the math stays easy to follow.
            </p>

            <div className="rules-kicker">When all five chests match</div>
            <p className="rules-section-lead">
              The chests read left to right. When every lid shows the same relic, you have a full-row strike—the ledger
              rewards the rarest agreements first and still tips its hat to the humbler patterns at the bottom of the
              chart.
            </p>
            {rulesTreasureRows.map((row, i) => (
              <div key={row.id} className="rules-treasure-card">
                <div
                  className="rules-treasure-ico-wrap"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: SYM_SVG[row.id] || '' }}
                />
                <div className="rules-treasure-body">
                  {i === 0 && <span className="rules-treasure-tier">Richest full row</span>}
                  <div className="rules-treasure-titleline">
                    <span className="rules-treasure-name">{row.name}</span>
                    <span className="rules-treasure-sep" aria-hidden="true">
                      ·
                    </span>
                    <span className="rules-treasure-mult">×{row.mult}</span>
                  </div>
                  <p className="rules-treasure-blurb">{rulesFullRowFlavor(row.id, row.name, row.mult)}</p>
                </div>
              </div>
            ))}

            <div className="rules-kicker">Runs that almost go the distance</div>
            <p className="rules-section-lead">
              The chests read from left to right. You do not always need five copies to hear the coins clink—tight runs
              still count.
            </p>

            <div className="rules-partial-card">
              <div className="rules-partial-visual" aria-hidden="true">
                {[1, 2, 3, 4, 5].map(n => (
                  <span key={n} className={`rules-run-dot${n <= 4 ? ' rules-run-dot--on' : ''}`} />
                ))}
              </div>
              <div className="rules-partial-copy">
                <span className="rules-partial-badge">Great find</span>
                <p>
                  Four matching relics in a row still sings victory. A <strong>great find</strong> pays{' '}
                  <strong className="rules-pay-num">{GREAT_FIND_MULT}×</strong> the coins you put into that search.
                </p>
              </div>
            </div>

            <div className="rules-partial-card rules-partial-card--good">
              <div className="rules-partial-visual" aria-hidden="true">
                {[1, 2, 3, 4, 5].map(n => (
                  <span key={n} className={`rules-run-dot${n <= 3 ? ' rules-run-dot--on' : ''}`} />
                ))}
              </div>
              <div className="rules-partial-copy">
                <span className="rules-partial-badge rules-partial-badge--soft">Good find</span>
                <p>
                  Three in a row is the spark that keeps the quest alive. A <strong>good find</strong> returns{' '}
                  <strong className="rules-pay-num">{GOOD_FIND_MULT}×</strong> the coins you spent on that search. Fewer
                  than three matching chests in a run does not award coins—so chase the longest chain you can.
                </p>
              </div>
            </div>
          </div>
          <button type="button" className="rules-done-btn" onClick={() => setRulesOpen(false)}>
            Back to the hunt
          </button>
        </div>
      </div>

    </>
  );
}