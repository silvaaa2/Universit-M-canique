import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ===== CONFIG FIREBASE =====
const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.appspot.com",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const SHEET_ID = "1oGwdggjcA4X2Zxsj4TD_iKrablfK6_pK4hXjXiptCBc";
const SHEETS = [
  { name: "Dukes", label: "Custom Facile", vehicle: "Dukes", gid: "1133112226" },
  { name: "Sentinel XS4", label: "Custom Moyen", vehicle: "Sentinel XS4", gid: "1138787690" },
  { name: "Annis Rumina", label: "Custom Difficile", vehicle: "Annis Rumina", gid: "49030161" }
];

let allStudents = [];
let activeStudentFilter = "all";
let customCorrections = {};

const studentsGrid = document.getElementById("studentsGrid");
const studentsStatus = document.getElementById("studentsStatus");
const studentDetail = document.getElementById("studentDetail");

// ===== UTILITAIRES =====
function waitForProfUser() {
  return new Promise(resolve => {
    if (auth.currentUser) return resolve(auth.currentUser);
    const unsub = onAuthStateChanged(auth, user => { unsub(); resolve(user); });
  });
}

function safeDocId(value) { return encodeURIComponent(String(value)); }
function csvUrl(gid) { return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`; }
function normalizeStatus(status) { if(status==="approved") return "approved"; if(status==="refused") return "refused"; return "pending"; }
function statusLabel(status) { if(status==="approved") return "Approuvé"; if(status==="refused") return "Refusé"; return "En attente"; }
function getStoredStatus(studentId) { return normalizeStatus(customCorrections[studentId]?.status); }

// ===== CSV PARSE =====
function parseCSV(text) {
  const rows = [];
  let current="", row=[], inQuotes=false;
  for(let i=0;i<text.length;i++){
    const char=text[i], next=text[i+1];
    if(char==='\"' && inQuotes && next==='\"'){ current+='"'; i++; }
    else if(char==='\"') inQuotes=!inQuotes;
    else if(char===',' && !inQuotes){ row.push(current.trim()); current=""; }
    else if((char==='\n'||char==='\r') && !inQuotes){
      if(current || row.length){ row.push(current.trim()); rows.push(row); row=[]; current=""; }
      if(char==='\r' && next==='\n') i++;
    } else current+=char;
  }
  if(current || row.length){ row.push(current.trim()); rows.push(row); }
  return rows;
}

// ===== FIRESTORE STATUS =====
async function loadCustomCorrections() {
  const user = await waitForProfUser();
  if(!user){ customCorrections={}; return; }
  const snapshot = await getDocs(collection(db,"customCorrections"));
  const loaded={};
  snapshot.forEach(item=>{
    const data=item.data();
    if(!data.studentId) return;
    loaded[data.studentId]={status:normalizeStatus(data.status), updatedBy:data.updatedBy||"", updatedAt:data.updatedAt||null};
  });
  customCorrections=loaded;
}

async function setStoredStatus(studentId,status){
  const user = await waitForProfUser();
  if(!user) throw new Error("Aucun professeur connecté.");
  const cleanStatus = normalizeStatus(status);
  customCorrections[studentId]={status:cleanStatus, updatedBy:user.email||"", updatedAt:new Date().toISOString()};
  await setDoc(doc(db,"customCorrections",safeDocId(studentId)),{
    studentId,status:cleanStatus,updatedBy:user.email||"",updatedAt:serverTimestamp()
  },{merge:true});
}

// ===== CHARGEMENT STUDENTS =====
async function loadStudents(){
  if(!studentsStatus||!studentsGrid||!studentDetail) return;
  studentsStatus.textContent="Import des réponses depuis Google Sheets...";
  studentsGrid.innerHTML=""; studentDetail.classList.remove("show","focus-pop"); document.body.classList.remove("student-focus");
  await loadCustomCorrections();
  const imported=[];
  for(const sheet of SHEETS){
    const response = await fetch(csvUrl(sheet.gid));
    const csvText = await response.text();
    const rows = parseCSV(csvText);
    if(rows.length<2) continue;
    const headers = rows[0].map(h=>h.trim());
    rows.slice(1).forEach((row,index)=>{
      const rowNumber=index+2, name=row[1]||"", uniqueId=row[2]||""; 
      if(!name&&!uniqueId) return;
      const studentId=`${sheet.name}-${rowNumber}-${uniqueId||name}`;
      const student={id:studentId,rowNumber,sheet:sheet.name,customLabel:sheet.label,vehicle:sheet.vehicle,name:name||"Sans nom",uniqueId:uniqueId||"Aucun ID",status:getStoredStatus(studentId),answers:[],photos:[]};
      headers.forEach((header,colIndex)=>{
        const value=row[colIndex]; if(!value) return;
        if(header.toLowerCase().includes("photo")||header.toLowerCase().includes("final")) student.photos.push({label:header,url:value});
        else student.answers.push({label:header,value});
      });
      imported.push(student);
    });
  }
  allStudents=imported; renderStudents();
}

function renderStudents(){
  const filtered = activeStudentFilter==="all"?allStudents:allStudents.filter(s=>s.sheet===activeStudentFilter);
  studentsStatus.textContent=`${filtered.length} réponse(s) affichée(s).`;
  if(!filtered.length){ studentsGrid.innerHTML=`<div class="student-info-card wide"><h4>Aucune réponse</h4><p>Aucune donnée trouvée pour ce filtre.</p></div>`; return; }
  studentsGrid.innerHTML=filtered.map(student=>`
    <button class="student-card ${student.status}" onclick="openStudentDetailWithLoading('${encodeURIComponent(student.id)}')">
      <small>${student.customLabel}</small>
      <h4>${student.name}</h4>
      <p>${student.vehicle} — ID ${student.uniqueId}</p>
      <div class="student-badge ${student.status}">${statusLabel(student.status)}</div>
    </button>
  `).join("");
}

// ===== FILTRAGE =====
function setStudentFilter(filter){
  activeStudentFilter=filter;
  document.querySelectorAll(".student-filter").forEach(b=>b.classList.remove("active"));
  const currentButton=document.querySelector(`[data-student-filter="${filter}"]`);
  if(currentButton) currentButton.classList.add("active");
  if(studentDetail) studentDetail.classList.remove("show","focus-pop");
  document.body.classList.remove("student-focus");
  renderStudents();
}

// ===== DETAIL STUDENT =====
function openStudentDetailWithLoading(studentId){
  const authOverlay=document.getElementById("authOverlay");
  if(authOverlay) authOverlay.classList.add("show");
  setTimeout(()=>{ openStudentDetail(studentId); if(authOverlay) authOverlay.classList.remove("show"); },180);
}

function openStudentDetail(studentId){
  const student = allStudents.find(s=>s.id===studentId);
  if(!student||!studentDetail) return;
  studentDetail.innerHTML=`
    <div class="student-detail-head">
      <div><span>${student.customLabel}</span><h3>${student.name}</h3><p>${student.vehicle} — ID ${student.uniqueId}</p></div>
      <button class="student-close" onclick="closeStudentDetail()">×</button>
    </div>
    <div class="student-focus-status ${student.status}">${statusLabel(student.status)}</div>
    <div class="student-detail-actions">
      <button class="status-btn approve" onclick="changeStudentStatus('${student.id}','approved')">Approuver</button>
      <button class="status-btn refuse" onclick="changeStudentStatus('${student.id}','refused')">Refuser</button>
      <button class="status-btn pending" onclick="changeStudentStatus('${student.id}','pending')">Remettre en attente</button>
    </div>
    <div class="student-info-grid">
      <div class="student-info-card"><h4>Informations élève</h4><div><strong>Nom RP</strong><span>${student.name}</span></div><div><strong>ID unique</strong><span>${student.uniqueId}</span></div><div><strong>Custom</strong><span>${student.customLabel} — ${student.vehicle}</span></div><div><strong>Statut</strong><span>${statusLabel(student.status)}</span></div></div>
      <div class="student-info-card"><h4>Photos envoyées</h4><div class="student-photos">${student.photos.map(p=>`<a class="photo-link" href="${p.url}" target="_blank">${p.label}</a>`).join("")||"<p>Aucune photo détectée.</p>"}</div></div>
      <div class="student-info-card wide"><h4>Réponses du formulaire</h4>${student.answers.map(a=>`<div class="student-line"><strong>${a.label}</strong><span>${a.value}</span></div>`).join("")}</div>
    </div>
  `;
  studentDetail.classList.add("show");
  document.body.classList.add("student-focus");
}

function closeStudentDetail(){
  if(studentDetail) studentDetail.classList.remove("show","focus-pop");
  document.body.classList.remove("student-focus");
}

// ===== STATUS =====
async function changeStudentStatus(studentId,status){ await setStoredStatus(studentId,status); loadStudents(); }

window.loadStudents=loadStudents;
window.renderStudents=renderStudents;
window.setStudentFilter=setStudentFilter;
window.openStudentDetailWithLoading=openStudentDetailWithLoading;
window.openStudentDetail=openStudentDetail;
window.closeStudentDetail=closeStudentDetail;
window.changeStudentStatus=changeStudentStatus;
