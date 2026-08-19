/* =========================================================
   BACKUP / АРХИВ — предыдущая версия герой-шестерни.
   Этот файл НЕ подключён в index.html и ни на что не влияет.
   Оставлен «на всякий случай»: здесь лежит старая реализация
   (16 зубьев, рамки-вкладки на ободе, малая зацепленная
   шестерёнка справа и маховик слева — то, что убрано в новой
   версии). Чтобы вернуть: подключить файл вместо js/mechanism.js
   и вызвать LEGACY_GEAR.init(el, activeTabs, labelFn).
   Актуальная версия: js/mechanism.js
   ========================================================= */
window.LEGACY_GEAR = (function(){
  "use strict";

  function makeVerticalStripesTex(THREE){
    const W=256, H=128;
    const c=document.createElement('canvas'); c.width=W; c.height=H;
    const x=c.getContext('2d');
    x.fillStyle='#dfd8c8'; x.fillRect(0,0,W,H);
    x.strokeStyle='#161413'; x.lineWidth=2;
    let rng=98765; const rnd=()=>{ rng=(rng*1103515245+12345)&0x7fffffff; return rng/0x7fffffff; };
    const top=16, bot=H-16;
    const count=2+Math.floor(rnd()*3);
    for(let k=0;k<count;k++){
      const px=14+rnd()*(W-28);
      const h=10+rnd()*30;
      const y=top+rnd()*((bot-top)-h);
      x.beginPath(); x.moveTo(px,y); x.lineTo(px,y+h); x.stroke();
    }
    const t=new THREE.CanvasTexture(c);
    t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(16,1);
    return t;
  }

  function gearShape(THREE, teeth, Rroot, Rtip){
    const s=new THREE.Shape();
    const step=Math.PI*2/teeth;
    const base=step*0.50, top=step*0.46, taper=(base-top)/2;
    const P=(r,ang)=>[r*Math.cos(ang), r*Math.sin(ang)];
    for(let i=0;i<teeth;i++){
      const a=i*step;
      if(i===0) s.moveTo(...P(Rroot, a));
      s.lineTo(...P(Rtip, a+taper));
      s.lineTo(...P(Rtip, a+taper+top));
      s.lineTo(...P(Rroot, a+base));
    }
    s.closePath();
    return s;
  }

  function makeLabelTex(THREE, text){
    const c=document.createElement('canvas'); c.width=512; c.height=160;
    const x=c.getContext('2d');
    x.clearRect(0,0,512,160);
    const rr=(X,Y,W,H,R)=>{ x.beginPath(); x.moveTo(X+R,Y); x.arcTo(X+W,Y,X+W,Y+H,R); x.arcTo(X+W,Y+H,X,Y+H,R); x.arcTo(X,Y+H,X,Y,R); x.arcTo(X,Y,X+W,Y,R); x.closePath(); };
    x.fillStyle='rgba(246,242,233,0.94)'; rr(10,10,492,140,22); x.fill();
    x.strokeStyle='#161413'; x.lineWidth=6; rr(10,10,492,140,22); x.stroke();
    x.fillStyle='#161413'; x.font='700 58px "Space Grotesk", sans-serif'; x.textAlign='center'; x.textBaseline='middle';
    x.fillText(text, 256, 82);
    const t=new THREE.CanvasTexture(c); t.anisotropy=4; return t;
  }

  let state=null, tabs=[], labelOf=()=>'';

  function buildLabels(){
    const THREE=window.THREE;
    if(!state || !THREE) return;
    state.labelMeshes.forEach((m,i)=>{
      const tex=makeLabelTex(THREE, labelOf(i));
      if(m.material.map) m.material.map.dispose();
      m.material.map=tex; m.material.needsUpdate=true;
    });
  }

  function init(heroEl, activeTabs, labelFn){
    const THREE=window.THREE;
    if(!THREE || !heroEl || state) return;
    tabs=activeTabs||[]; labelOf=labelFn||(()=>'');
    const w=heroEl.clientWidth||620, h=heroEl.clientHeight||560;
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(50, w/h, 0.1, 100);
    camera.position.set(0, 1.8, 5.3); camera.lookAt(0,0,0);
    const renderer=new THREE.WebGLRenderer({alpha:true, antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.setSize(w,h); renderer.setClearColor(0x000000,0);
    heroEl.appendChild(renderer.domElement);

    const paper=()=>new THREE.MeshBasicMaterial({color:0xf6f2e9});
    const inkMat=()=>new THREE.MeshBasicMaterial({color:0x161413});
    const mech=new THREE.Group(); scene.add(mech);

    const gearGroup=new THREE.Group(); mech.add(gearGroup);
    const teeth=16, Rroot=1.4, Rtip=1.65, H=0.55;
    const shape=gearShape(THREE, teeth, Rroot, Rtip);
    const geo=new THREE.ExtrudeGeometry(shape, {depth:H, bevelEnabled:false, steps:1, curveSegments:1});
    geo.rotateX(-Math.PI/2); geo.center();
    const sideMat=new THREE.MeshBasicMaterial({map:makeVerticalStripesTex(THREE), color:0xffffff});
    const mesh=new THREE.Mesh(geo, [paper(), sideMat]);
    gearGroup.add(mesh);
    const edges=new THREE.EdgesGeometry(geo, 1);
    gearGroup.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({color:0x161413})));

    const rLabel=Rtip+0.03, slot=Math.PI/2;
    const labelMeshes=[];
    for(let i=0;i<tabs.length;i++){
      const th=i*slot;
      const mat=new THREE.MeshBasicMaterial({transparent:true, side:THREE.DoubleSide, depthTest:true, depthWrite:false});
      const lab=new THREE.Mesh(new THREE.PlaneGeometry(1.35,0.45), mat);
      lab.position.set(rLabel*Math.sin(th), 0, rLabel*Math.cos(th));
      lab.rotation.y = th; lab.renderOrder = 3;
      gearGroup.add(lab); labelMeshes.push(lab);
    }

    /* --- УБРАНО в новой версии: малая шестерёнка справа --- */
    const sTeeth=12, sRroot=0.45, sRtip=0.6, sH=0.55;
    const D = Rtip + sRroot + 0.04;
    const sShape=gearShape(THREE, sTeeth, sRroot, sRtip);
    const sGeo=new THREE.ExtrudeGeometry(sShape, {depth:sH, bevelEnabled:false, steps:1, curveSegments:1});
    sGeo.rotateX(-Math.PI/2); sGeo.center();
    const smallGroup=new THREE.Group(); smallGroup.position.set(D, 0, 0); mech.add(smallGroup);
    smallGroup.add(new THREE.Mesh(sGeo, [paper(), new THREE.MeshBasicMaterial({map:makeVerticalStripesTex(THREE), color:0xffffff})]));
    smallGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(sGeo,1), new THREE.LineBasicMaterial({color:0x161413})));

    /* --- УБРАНО в новой версии: маховик слева --- */
    const flyGroup=new THREE.Group(); flyGroup.position.set(-(Rtip+0.72), 0, 0); mech.add(flyGroup);
    flyGroup.add(new THREE.Mesh(new THREE.TorusGeometry(0.6,0.1,8,40), inkMat()));
    for(let s=0;s<6;s++){ const sp=new THREE.Mesh(new THREE.BoxGeometry(1.15,0.07,0.07), inkMat()); sp.rotation.y=s*(Math.PI/3); flyGroup.add(sp); }
    flyGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.13,0.16,16), inkMat()));

    mech.scale.set(0.82,0.82,0.82);
    state={renderer,scene,camera,gearGroup,smallGroup,flyGroup,labelMeshes,sPhase:0.131,angle:0,target:0};
    buildLabels();
    requestAnimationFrame(tick);
  }

  function tick(){
    if(state){
      state.angle += (state.target - state.angle)*0.10;
      state.gearGroup.rotation.y = state.angle;
      state.smallGroup.rotation.y = -state.angle * (16/12) + state.sPhase;
      state.flyGroup.rotation.y = state.angle * 1.8;
      state.renderer.render(state.scene, state.camera);
    }
    requestAnimationFrame(tick);
  }

  function step(steps){ if(state) state.target -= steps * (Math.PI/2); }
  function resize(heroEl){
    if(!state || !heroEl) return;
    const w=heroEl.clientWidth||600, h=heroEl.clientHeight||500;
    state.renderer.setSize(w,h);
    state.camera.aspect=w/h; state.camera.updateProjectionMatrix();
  }

  return { init, step, resize, refreshLabels: buildLabels };
})();
