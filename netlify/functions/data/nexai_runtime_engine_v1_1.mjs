import fs from "node:fs";
import path from "node:path";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8")); }
function norm(s=""){
  return String(s).toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/&/g," and ").replace(/[_/\\|]+/g," ")
    .replace(/[-–—]+/g," ").replace(/[^\p{L}\p{N}\s]/gu," ")
    .replace(/\s+/g," ").trim();
}
function esc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }
function hasPhrase(q,a){ return new RegExp(`(^|\\s)${esc(a)}(?=\\s|$)`,"i").test(q); }

function normalizeVehicleTypos(q=""){return q.replace(/\bavansa\b/g,"avanza");}
function requestedSocketFamily(q=""){
  if(/\bh4\b/.test(q))return "h4";
  if(/\bh6\b/.test(q))return "h6";
  return null;
}
export class NexaiRuntimeEngine {
  constructor(root="."){
    const j=n=>readJson(path.join(root,n));
    this.products=j("product_knowledge_center_v3_machine_ready.json");
    this.vehicles=j("vehicle_intelligence_kamar4_v3_normalized.json");
    this.fitment=j("fitment_intelligence_kamar5_v2_1_integrity_repair.json");
    this.resolver=j("entity_resolver_v1_1_runtime.json");
    this.router=j("knowledge_router_v1_runtime.json");
    this.composer=j("response_composer_v1_runtime.json");
    this.orchestrator=j("nexai_runtime_orchestrator_v1.json");
    this.imam=j("imam_intelligence_runtime_v1.json");
    this.brand=j("brand_intelligence_runtime_v1.json");
    this.vehicleClass=j("product_vehicle_classification_v1.json");
    this.productLifecycle=j("product_lifecycle_v1.json");

    this.pById=Object.fromEntries(this.products.products.map(x=>[x.product_id,x]));
    this.vById=Object.fromEntries(this.vehicles.vehicles.map(x=>[x.vehicle_id,x]));
    this.fById=Object.fromEntries(this.fitment.fitments.map(x=>[x.fitment_id,x]));

    this.productAliases=[];
    for(const p of this.products.products){
      const vals=new Set([...(p.identity?.aliases||[]),...(p.search_index?.names||[]),p.identity?.name,p.identity?.sku,p.product_id].filter(Boolean));
      for(const a of vals){ const n=norm(a); if(n.length>=2) this.productAliases.push([n,p.product_id]); }
    }
    this.productAliases.sort((a,b)=>b[0].length-a[0].length);

    this.vehicleAliases=[];
    for(const v of this.vehicles.vehicles){
      const vals=new Set([...(v.identity?.aliases||[]),...(v.search_index?.aliases||[]),v.identity?.model_source,`${v.identity?.brand||""} ${v.identity?.model_source||""}`].filter(Boolean));
      for(const a of vals){ const n=norm(a); if(n.length>=2) this.vehicleAliases.push([n,v.vehicle_id]); }
    }
    this.vehicleAliases.sort((a,b)=>b[0].length-a[0].length);
  }

  resolve(query){
    const q=normalizeVehicleTypos(norm(query)), cq=q.replace(/\s+/g,"");
    const products=[], spans=[];

    // Compact alias scan first: catches "V9 Pro" -> "v9pro" without confusing it with V9.
    const compactEntries=Object.entries(this.resolver.indexes?.compact||{})
      .flatMap(([alias,refs])=>refs.filter(r=>r.type==="product" && alias.length>=4).map(r=>[alias,r.id]))
      .sort((a,b)=>b[0].length-a[0].length);

    for(const [a,pid] of compactEntries){
      let from=0;
      while(true){
        const i=cq.indexOf(a,from);
        if(i<0) break;
        const j=i+a.length;
        if(!spans.some(([s,e])=>!(j<=s||i>=e))){
          products.push(pid); spans.push([i,j]);
        }
        from=i+1;
      }
    }

    // If compact scan found nothing, use normalized aliases.
    if(!products.length){
      for(const [a,pid] of this.productAliases){
        if(hasPhrase(q,a) && !products.includes(pid)) products.push(pid);
      }
    }

    const requestedFamily=requestedSocketFamily(q);
    if(requestedFamily&&products.length){
      const strict=products.filter(pid=>{
        const p=this.pById[pid];
        const h=norm(`${p?.identity?.sku||""} ${p?.identity?.name||""}`);
        return new RegExp(`(^|\\s)${requestedFamily}(?=\\s|$)`).test(h);
      });
      if(strict.length)products.splice(0,products.length,...strict);
    }

    const ym=q.match(/\b(?:19|20)?\d{2}\b/g);
    let year=null;
    if(ym?.length){
      const y=Number(ym.at(-1));
      year=y>=1000?y:(y<=40?2000+y:1900+y);
    }

    let vehicles=[];
    const seen=new Set();
    for(const [a,vid] of this.vehicleAliases){
      if(!hasPhrase(q,a)) continue;
      const v=this.vById[vid], ys=v.identity?.year?.start, ye=v.identity?.year?.end;
      if(year!==null && ys!=null && ye!=null && !(ys<=year && year<=ye)) continue;
      if(!seen.has(vid)){ vehicles.push(vid); seen.add(vid); }
    }
    if(year!==null && vehicles.length){
      vehicles.sort((x,y)=>{
        const a=this.vById[x].identity.year, b=this.vById[y].identity.year;
        return (a.end-a.start)-(b.end-b.start) || x.localeCompare(y);
      });
      vehicles=vehicles.slice(0,1);
    }
    const visibleProducts=[...new Set(products)].filter(pid=>this.lifecycleFor(pid).search_enabled===true);
    return {products:visibleProducts,vehicles,year};
  }

  intents(query,entities){
    const q=norm(query), out=[];
    const has=(xs)=>xs.some(x=>q.includes(norm(x)));
    if(has(["foto","gambar","galeri","halaman katalog","lihat produk"])) out.push("product_visual");
    if(has(["harga","promo","diskon","stok","garansi","beli","whatsapp"])) out.push("product_commercial");
    if(entities.vehicles.length && has(["cocok pakai apa","pakai lampu apa","produk nine apa","rekomendasi lampu","cocoknya apa","rekomendasi produk"])) out.push("fitment_vehicle_to_product");
    if(entities.products.length && has(["cocok mobil apa","untuk mobil apa","kendaraan apa","cocok untuk mobil"])) out.push("fitment_product_to_vehicle");
    if(entities.products.length>=2 && has(["bandingkan","compare","beda","perbedaan"," versus "])) out.push("product_compare");
    if(entities.products.length && has(["spek","spesifikasi","fitur","fungsi","daya","watt","lumen","volt","tegangan","warna","material","umur pakai","socket","soket","deskripsi"])) out.push("product_info");
    if(entities.vehicles.length && has(["socket","soket","lampu bawaan","headlamp","foglamp","lampu dekat","lampu jauh","sein","lampu mundur","lampu plat","lampu rem"])) out.push("vehicle_info");
    if(has(["imam siapa","siapa imam","imam sales nine","profil imam","tentang imam","kontak imam","hubungi imam"])) out.push("imam_profile");
    if(has(["nine autoseries","subbrand nine","sub brand nine","luximos","lx trix","lx-trix","securicle","soundblax","optimus","nine power"])) out.push("brand_subbrand");
    if(has(["sekarang","hari ini","terbaru","terkini","saat ini"])) out.push("current_info");
    if(!out.length){
      if(entities.products.length) out.push("product_info");
      else if(entities.vehicles.length) out.push("vehicle_info");
      else out.push("general_ai");
    }
    return [...new Set(out)];
  }


  lifecycleFor(productId){
    const policy=this.productLifecycle?.policy||{};
    const rules=policy.status_rules||{};
    const entry=this.productLifecycle?.products?.[productId]||{};
    const status=entry.status||policy.default_status||"active";
    const rule=rules[status]||rules.active||{
      search_enabled:true,
      direct_answer_enabled:true,
      recommendation_enabled:true
    };
    return {
      product_id:productId,
      status,
      search_enabled:entry.search_enabled ?? rule.search_enabled ?? true,
      direct_answer_enabled:entry.direct_answer_enabled ?? rule.direct_answer_enabled ?? true,
      recommendation_enabled:entry.recommendation_enabled ?? rule.recommendation_enabled ?? true,
      note:entry.note||""
    };
  }

  recommendationEnabled(productId){
    return this.lifecycleFor(productId).recommendation_enabled===true;
  }

  productVehicleClass(productId){
    const groups=this.vehicleClass?.groups||{};
    const matches=[];
    for(const [groupName,group] of Object.entries(groups)){
      for(const r of group.records||[]){
        if(r.product_id===productId){
          matches.push({
            group:groupName,
            vehicle_class:(r.vehicle_class||group.vehicle_class||[]),
            allow_car:r.allow_car_recommendation!==false,
            allow_motorcycle:r.allow_motorcycle_recommendation!==false,
            position:r.position||group.position||[],
            socket:r.socket||[],
            application_note:r.application_note||""
          });
        }
      }
    }
    if(!matches.length)return null;
    return {
      matches,
      allow_car:matches.some(x=>x.allow_car===true),
      allow_motorcycle:matches.some(x=>x.allow_motorcycle===true),
      vehicle_class:[...new Set(matches.flatMap(x=>Array.isArray(x.vehicle_class)?x.vehicle_class:[x.vehicle_class]).filter(Boolean))]
    };
  }

  isHeadlampPosition(position=""){
    return String(position||"").toLowerCase().startsWith("headlamp");
  }

  isCarVehicle(vehicleId){
    // Kamar 4 saat ini berisi database mobil; semua vehicle_id di room ini diperlakukan sebagai car.
    return !!this.vById[vehicleId];
  }

  positionPriority(position=""){
    const p=String(position||"").toLowerCase();
    if(p.startsWith("headlamp"))return 0;
    if(p.startsWith("foglamp"))return 1;
    if(p.includes("parking")||p.includes("senja"))return 2;
    if(p.includes("turn_signal")||p.includes("sein"))return 3;
    if(p.includes("brake")||p.includes("rem"))return 4;
    if(p.includes("reverse")||p.includes("mundur"))return 5;
    if(p.includes("license_plate")||p.includes("plat"))return 6;
    return 9;
  }

  filterFitmentForVehicle(vehicleId,recs){
    const isCar=this.isCarVehicle(vehicleId);
    return recs.filter(r=>{
      if(!this.recommendationEnabled(r.product_id))return false;
      const cls=this.productVehicleClass(r.product_id);

      // HEADLAMP = STRICT ALLOWLIST.
      // If product is not explicitly classified for this vehicle class, it cannot
      // enter headlamp recommendations merely because the socket matches.
      if(this.isHeadlampPosition(r.position)){
        if(!cls)return false;
        if(isCar)return cls.allow_car===true;
        return cls.allow_motorcycle===true;
      }

      // Non-headlamp positions keep normal fitment behavior, but explicit bans
      // in classification remain authoritative.
      if(!cls)return true;
      if(isCar && cls.allow_car===false)return false;
      if(!isCar && cls.allow_motorcycle===false)return false;
      return true;
    });
  }

  filterFitmentForProduct(productId,recs){
    if(!this.recommendationEnabled(productId))return [];
    const cls=this.productVehicleClass(productId);

    // For headlamp compatibility, unclassified products are not allowed to infer
    // car compatibility from socket alone.
    const hasHeadlamp=recs.some(r=>this.isHeadlampPosition(r.position));
    if(hasHeadlamp){
      if(!cls)return [];
      if(cls.allow_car!==true)return [];
    }

    if(!cls)return recs;
    if(cls.allow_car===false)return [];
    return recs;
  }

  handle(query,session={}){
    const entities=this.resolve(query), intents=this.intents(query,entities);
    const facts={}, warnings=[];
    if(intents.includes("imam_profile")) facts.imam=this.imam.facts;
    if(intents.includes("brand_subbrand")) facts.brand=this.brand;

    for(const pid of entities.products.slice(0,3)){
      const p=this.pById[pid];
      if(intents.includes("product_info")||intents.includes("product_compare")){
        (facts.products??=[]).push({
          product_id:pid,name:p.identity?.name,sku:p.identity?.sku,
          lifecycle:this.lifecycleFor(pid),
          subbrand:p.brand?.subbrand,description:p.catalog?.description,
          technical:p.technical?.best_available,
          features:p.features?.combined_search_features,
          variants:p.variants,confidence:p.confidence
        });
      }
      if(intents.includes("product_commercial")) (facts.commercial??=[]).push({product_id:pid,...(p.commercial||{})});
      if(intents.includes("product_visual")) (facts.visual??=[]).push({product_id:pid,...(p.visual||{})});
      if(intents.includes("fitment_product_to_vehicle")){
        const ids=this.fitment.indexes.by_product?.[pid]||[];
        let recs=ids.map(id=>this.fById[id]).filter(x=>x&&["high","medium"].includes(x.confidence));
        recs=this.filterFitmentForProduct(pid,recs)
          .sort((a,b)=>this.positionPriority(a.position)-this.positionPriority(b.position)||(a.confidence==="high"?0:1)-(b.confidence==="high"?0:1)||String(a.vehicle_id||"").localeCompare(String(b.vehicle_id||"")))
          .slice(0,20);
        (facts.fitment_product_to_vehicle??=[]).push({product_id:pid,candidates:recs});
      }
    }

    for(const vid of entities.vehicles.slice(0,2)){
      const v=this.vById[vid];
      if(intents.includes("vehicle_info")) (facts.vehicles??=[]).push({vehicle_id:vid,identity:v.identity,lighting:v.lighting,verification:v.verification});
      if(intents.includes("fitment_vehicle_to_product")){
        const ids=this.fitment.indexes.by_vehicle?.[vid]||[];
        let recs=ids.map(id=>this.fById[id]).filter(x=>x&&["high","medium"].includes(x.confidence));
        recs=this.filterFitmentForVehicle(vid,recs)
          .sort((a,b)=>this.positionPriority(a.position)-this.positionPriority(b.position)||(a.confidence==="high"?0:1)-(b.confidence==="high"?0:1)||String(a.product_id||"").localeCompare(String(b.product_id||"")))
          .slice(0,20);
        (facts.fitment_vehicle_to_product??=[]).push({vehicle_id:vid,candidates:recs});
      }
    }

    if(intents.includes("current_info")) facts.current={status:"live_source_required"};
    const llm_used=intents.includes("product_compare")||intents.includes("general_ai");
    return {query,session,entities,intents,facts,warnings,llm_used};
  }
}
