import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// CONFIG FIREBASE LOGIN
const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

// GOOGLE SHEETS CONFIG
const CUSTOM_SHEET_ID = "1oGwdggjcA4X2Zxsj4TD_iKrablfK6_pK4hXjXiptCBc";
const CUSTOMS = [
  { name: "Dukes", label: "Custom Facile", gid: "1133112226" },
  { name: "Sentinel XS4", label: "Custom Moyen", gid: "1138787690" },
  { name: "Annis Rumina", label: "Custom Difficile", gid: "49030161" }
];

const EXAM_SHEET_ID = "1Nqivjm5iqWTwyzWvKCH35vb8tGMzcLHFoSTHtnwp_RY";
const EXAM_GID = "282279229";

// ELEMENTS DOM
const studentsGrid = document.getElementById("studentsGrid");
const studentsStatus = document.getElementById("studentsStatus");
const studentDetail = document.getElementById("studentDetail");
const examGrid = document.getElementById("examGrid");
const examStatus = document.getElementById("examStatus");
const examDetail = document.getElementById("examDetail");

// UTILS
function csvUrl(sheetId, gid) {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

function parseCSV(text) {
  const rows = [];
  let current = "", row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i+1];
    if (char === '"' && inQuotes && next === '"') { current+='"'; i++; }
    else if (char === '"') inQuotes=!inQuotes;
    else if(char===',' && !inQuotes){row.push(current.trim()); current='';}
    else if((char==='\n'||char==='\r')&&!inQuotes){ if(current||row.length){row.push(current.trim()); rows.push(row); row=[]; current='';} if(char==='\r' && next==='\n') i++; }
    else current+=char;
  }
  if(current||row.length){row.push(current.trim()); rows.push(row);}
  return rows;
}

function escapeHTML(value) { return String(value||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }

// LOAD CUSTOMS
async function loadCustoms() {
  if(!studentsGrid||!studentsStatus||!studentDetail) return;
  studentsStatus.textContent = "Chargement des réponses depuis Google Sheets...";
  studentsGrid.innerHTML = "";
  studentDetail.classList.remove("show","focus-pop");

  const allStudents = [];

  for(const sheet of CUSTOMS){
    const res = await fetch(csvUrl(CUSTOM_SHEET_ID, sheet.gid));
    const text = await res.text();
    const rows = parseCSV(text);
    if(rows.length<2) continue;
    const headers = rows[0];

    rows.slice(1).forEach((row,i)=>{
      const name = row[1]||"Sans nom";
      const uid = row[2]||`id${i+2}`;
      const studentId = `${sheet.name}-${i+2}-${uid}`;
      const answers = headers.map((h,j)=>({label:h,value:row[j]}));
      allStudents.push({id:studentId,name,uniqueId:uid,sheet:sheet.name,customLabel:sheet.label,vehicle:sheet.name,status:"pending",answers,photos:[]});
    });
  }

  renderStudents(allStudents);
}

function renderStudents(allStudents){
  studentsStatus.textContent = `${allStudents.length} réponse(s) affichée(s).`;
  if(!allStudents.length){studentsGrid.innerHTML="<div>Aucune réponse trouvée.</div>"; return;}
  studentsGrid.innerHTML = allStudents.map(s=>`
    <button class="student-card ${s.status}" onclick="openStudentDetail('${escapeHTML(s.id)}')">
      <small>${escapeHTML(s.customLabel)}</small>
      <h4>${escapeHTML(s.name)}</h4>
      <p>${escapeHTML(s.vehicle)} — ID ${escapeHTML(s.uniqueId)}</p>
      <div class="student-badge">${s.status==="approved"?"Approuvé":s.status==="refused"?"Refusé":"En attente"}</div>
    </button>
  `).join("");
}

function openStudentDetail(studentId){
  const student = [...document.querySelectorAll(".student-card")].find(c=>c.onclick.toString().includes(studentId));
  if(!studentDetail||!student) return;
  studentDetail.innerHTML=`<h4>Détails de l'élève: ${studentId}</h4>`;
  studentDetail.classList.add("show");
}

// LOAD EXAM
async function loadExam() {
  if(!examGrid||!examStatus||!examDetail) return;
  examStatus.textContent="Chargement des réponses d’examen...";
  examGrid.innerHTML="";

  const res = await fetch(csvUrl(EXAM_SHEET_ID, EXAM_GID));
  const text = await res.text();
  const rows = parseCSV(text);
  if(rows.length<2){examStatus.textContent="Aucune réponse d’examen trouvée."; return;}
  const headers = rows[0];

  const students = rows.slice(1).map((row,i)=>{
    const name=row[1]||"Sans nom";
    const uid=row[2]||`id${i+2}`;
    const studentId=`exam-${i+2}-${uid}`;
    const answers = headers.map((h,j)=>({label:h,value:row[j]}));
    return {id:studentId,name,uniqueId:uid,questions:answers};
  });

  renderExam(students);
}

function renderExam(students){
  examStatus.textContent=`${students.length} réponse(s) d’examen affichée(s).`;
  if(!students.length){examGrid.innerHTML="<div>Aucune réponse trouvée.</div>"; return;}
  examGrid.innerHTML = students.map(s=>`
    <button class="exam-student-card" onclick="openExamDetail('${escapeHTML(s.id)}')">
      <h4>${escapeHTML(s.name)}</h4>
      <p>ID ${escapeHTML(s.uniqueId)}</p>
    </button>
  `).join("");
}

function openExamDetail(studentId){
  const student = [...document.querySelectorAll(".exam-student-card")].find(c=>c.onclick.toString().includes(studentId));
  if(!examDetail||!student) return;
  examDetail.innerHTML=`<h4>Détails de l'examen: ${studentId}</h4>`;
  examDetail.classList.add("show");
}

// EXPORT
window.loadCustoms = loadCustoms;
window.loadExam = loadExam;
window.openStudentDetail = openStudentDetail;
window.openExamDetail = openExamDetail;

// AUTO LOAD AFTER LOGIN
onAuthStateChanged(auth,(user)=>{if(user){loadCustoms(); loadExam();}});
