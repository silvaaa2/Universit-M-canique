const SHEET_ID = "1oGwdggjcA4X2Zxsj4TD_iKrablfK6_pK4hXjXiptCBc";

const SHEETS = [
  { name: "Dukes", label: "Custom Facile", vehicle: "Dukes", gid: "1133112226" },
  { name: "Sentinel XS4", label: "Custom Moyen", vehicle: "Sentinel XS4", gid: "1138787690" },
  { name: "Annis Rumina", label: "Custom Difficile", vehicle: "Annis Rumina", gid: "49030161" }
];

let allStudents = [];
let activeStudentFilter = "all";

const studentsGrid = document.getElementById("studentsGrid");
const studentsStatus = document.getElementById("studentsStatus");
const studentDetail = document.getElementById("studentDetail");

function csvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

function parseCSV(text) {
  const rows = [];
  let current = "", row = [], inQuotes = false;
  for (let i=0;i<text.length;i++){
    const char = text[i], next=text[i+1];
    if(char=='"' && inQuotes && next=='"'){current+='"';i++;} 
    else if(char=='"'){inQuotes=!inQuotes;} 
    else if(char==',' && !inQuotes){row.push(current.trim());current='';} 
    else if((char=='\n'||char=='\r') && !inQuotes){row.push(current.trim());rows.push(row);row=[];current=''; if(char=='\r'&&next=='\n')i++;} 
    else {current+=char;}
  }
  if(current||row.length){row.push(current.trim());rows.push(row);}
  return rows;
}

function isUsefulValue(v){return v!==undefined&&v!==null&&String(v).trim()!=""}
function isPhotoColumn(header){return String(header).toLowerCase().includes("photo")||header.toLowerCase().includes("final");}

async function loadStudents() {
  if(!studentsGrid||!studentsStatus||!studentDetail) return;
  studentsStatus.textContent = "Chargement des réponses depuis Google Sheets...";
  studentsGrid.innerHTML=""; studentDetail.classList.remove("show"); document.body.classList.remove("student-focus");

  try {
    let imported=[];
    for(const sheet of SHEETS){
      const res = await fetch(csvUrl(sheet.gid));
      const text = await res.text();
      const rows = parseCSV(text);
      if(rows.length<2) continue;
      const headers = rows[0].map(h=>h.trim());
      rows.slice(1).forEach((row,index)=>{
        const rowNumber = index+2;
        const name = row[1]||"Sans nom";
        const uniqueId = row[2]||"Aucun ID";
        const studentId = `${sheet.name}-${rowNumber}-${uniqueId||name}`;
        const answers=[], photos=[];
        headers.forEach((h,i)=>{
          if(!h) return; 
          const v=row[i]; 
          if(!isUsefulValue(v)) return;
          if(isPhotoColumn(h)){photos.push({label:h,url:v});} else {answers.push({label:h,value:v});}
        });
        imported.push({id:studentId,rowNumber,sheet:sheet.name,customLabel:sheet.label,vehicle:sheet.vehicle,name,uniqueId,status:"pending",answers,photos});
      });
    }
    allStudents=imported;
    renderStudents();
  } catch(e){
    console.error(e);
    studentsStatus.textContent="Erreur : impossible d'importer les réponses.";
  }
}

function renderStudents(){
  if(!studentsGrid||!studentsStatus) return;
  const filtered = activeStudentFilter==="all"?allStudents:allStudents.filter(s=>s.sheet===activeStudentFilter);
  studentsStatus.textContent = `${filtered.length} réponse(s) affichée(s).`;
  if(!filtered.length){studentsGrid.innerHTML=`<div class="student-info-card wide"><h4>Aucune réponse</h4></div>`;return;}
  studentsGrid.innerHTML=filtered.map(s=>`
    <button class="student-card ${s.status}" onclick="openStudentDetailWithLoading('${s.id}')">
      <small>${s.customLabel}</small>
      <h4>${s.name}</h4>
      <p>${s.vehicle} — ID ${s.uniqueId}</p>
      <div class="student-badge">${s.status}</div>
    </button>
  `).join("");
}

function setStudentFilter(filter){
  activeStudentFilter = filter;
  document.querySelectorAll(".student-filter").forEach(b=>b.classList.remove("active"));
  const btn = document.querySelector(`[data-student-filter="${filter}"]`);
  if(btn) btn.classList.add("active");
  if(studentDetail) studentDetail.classList.remove("show"); document.body.classList.remove("student-focus");
  renderStudents();
}

function openStudentDetailWithLoading(id){studentDetail.classList.add("loading");setTimeout(()=>{openStudentDetail(id);studentDetail.classList.remove("loading");},100);}
function openStudentDetail(id){
  const s = allStudents.find(x=>x.id===id); if(!s||!studentDetail) return;
  const mainAnswers = s.answers.filter(a=>!a.label.toLowerCase().includes("horodateur"));
  studentDetail.innerHTML=`
    <div class="student-detail-head">
      <div><span>${s.customLabel}</span><h3>${s.name}</h3><p>${s.vehicle} — ID ${s.uniqueId}</p></div>
      <button class="student-close" onclick="closeStudentDetail()">×</button>
    </div>
    <div class="student-info-grid">
      <div class="student-info-card">
        <h4>Réponses du formulaire</h4>
        ${mainAnswers.map(a=>`<div class="student-line"><strong>${a.label}</strong><span>${a.value}</span></div>`).join("")}
      </div>
      <div class="student-info-card">
        <h4>Photos envoyées</h4>
        <div class="student-photos">
          ${s.photos.length?s.photos.map(p=>`<a href="${p.url}" target="_blank">${p.label}</a>`).join(""):`<p>Aucune photo.</p>`}
        </div>
      </div>
    </div>
  `;
  document.body.classList.add("student-focus");
  studentDetail.classList.add("show");
}
function closeStudentDetail(){if(studentDetail){studentDetail.classList.remove("show");}document.body.classList.remove("student-focus");}

document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".student-filter").forEach(btn=>btn.addEventListener("click",()=>setStudentFilter(btn.dataset.studentFilter)));
});

window.loadStudents = loadStudents;
window.renderStudents = renderStudents;
window.setStudentFilter = setStudentFilter;
window.openStudentDetailWithLoading = openStudentDetailWithLoading;
window.openStudentDetail = openStudentDetail;
window.closeStudentDetail = closeStudentDetail;
