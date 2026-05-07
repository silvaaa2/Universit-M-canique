// assets/js/exams-import.js
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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
const db = getFirestore(app);

// ================== CONFIG EXAM ==================
const EXAM_SHEET_ID = "1Nqivjm5iqWTwyzWvKCH35vb8tGMzcLHFoSTHtnwp_RY";
const EXAM_GID = "282279229";
const EXAM_MAX_POINTS = 50;
const EXAM_PASS_POINTS = 40;
const EXAM_POINTS_MANUAL = [1,6,2,3,4,7,1,4,5,3,4,3,3,4];

let allExamStudents = [];
let examCorrections = {};

const examStatus = document.getElementById("examStatus");
const examGrid = document.getElementById("examGrid");
const examDetail = document.getElementById("examDetail");

// ================== UTIL ==================
function waitForProfUser() {
  return new Promise((resolve) => {
    if (auth.currentUser) return resolve(auth.currentUser);
    const unsub = onAuthStateChanged(auth, user => {
      unsub();
      resolve(user);
    });
  });
}

function safeDocId(value) {
  return encodeURIComponent(String(value));
}

function examCsvUrl() {
  return `https://docs.google.com/spreadsheets/d/${EXAM_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${EXAM_GID}`;
}

function parseExamCSV(text) {
  const rows = [];
  let current="", row=[], inQuotes=false;
  for (let i=0;i<text.length;i++){
    const char=text[i], next=text[i+1];
    if (char=='"' && inQuotes && next=='"'){ current+='"'; i++; }
    else if (char=='"') inQuotes=!inQuotes;
    else if (char==',' && !inQuotes){ row.push(current.trim()); current=""; }
    else if ((char=='\n'||char=='\r') && !inQuotes){
      if(current || row.length){ row.push(current.trim()); rows.push(row); row=[]; current=""; }
      if(char=='\r' && next=='\n') i++;
    } else current+=char;
  }
  if(current || row.length){ row.push(current.trim()); rows.push(row); }
  return rows;
}

function examEscapeHTML(value){return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
function normalizeExamHeader(header){return String(header??"").trim().toLowerCase();}
function isExamMetaColumn(header){const h=normalizeExamHeader(header);return h.includes("horodateur")||h.includes("timestamp")||h.includes("adresse e-mail")||h.includes("email")||h.includes("score")||h.includes("prénom")||h.includes("prenom")||h.includes("nom")||h.includes("id unique")||h==='id';}
function getExamName(row, headers){const index=headers.findIndex(h=>normalizeExamHeader(h).includes("prenom")||normalizeExamHeader(h).includes("nom")); return index>=0&&row[index]?row[index]:"Sans nom";}
function getExamUniqueId(row, headers){const index=headers.findIndex(h=>normalizeExamHeader(h).includes("id unique")||normalizeExamHeader(h)==="id"); return index>=0&&row[index]?row[index]:"Aucun ID";}
function getExamQuestionMaxPoints(idx){return Number(EXAM_POINTS_MANUAL[idx]||0);}
function getDefaultExamCorrection(){return {points:{}, extras:{stage:false,custom:false}, comment:""};}
function getExamCorrection(studentId){const saved=examCorrections[studentId];return {points:saved?.points||{}, extras:{stage:Boolean(saved?.extras?.stage), custom:Boolean(saved?.extras?.custom)}, comment:saved?.comment||""};}

// ================== FIRESTORE ==================
async function loadExamCorrections(){
  const user=await waitForProfUser();
  if(!user){examCorrections={};return;}
  const snapshot=await getDocs(collection(db,"examCorrections"));
  const loaded={};
  snapshot.forEach(item=>{
    const data=item.data();
    if(!data.studentId) return;
    loaded[data.studentId]={points:data.points||{}, extras:{stage:Boolean(data.extras?.stage), custom:Boolean(data.extras?.custom)}, comment:data.comment||"", updatedBy:data.updatedBy||"", updatedAt:data.updatedAt||null};
  });
  examCorrections=loaded;
}

async function saveExamCorrection(studentId, correction){
  const user=await waitForProfUser();
  if(!user) throw new Error("Aucun professeur connecté.");
  examCorrections[studentId]={points:correction.points||{}, extras:{stage:Boolean(correction.extras?.stage), custom:Boolean(correction.extras?.custom)}, comment:correction.comment||"", updatedBy:user.email||"", updatedAt:new Date().toISOString()};
  await setDoc(doc(db,"examCorrections",safeDocId(studentId)), {studentId, points:correction.points||{}, extras:{stage:Boolean(correction.extras?.stage), custom:Boolean(correction.extras?.custom)}, comment:correction.comment||"", updatedBy:user.email||"", updatedAt:serverTimestamp()}, {merge:true});
}

// ================== CALCUL ==================
function calculateExamBaseScore(student){const correction=getExamCorrection(student.id);return student.questions.reduce((total,q,i)=>total+Math.max(0,Math.min(Number(correction.points[i]??0),q.maxPoints)),0);}
function calculateExamExtraPoints(student){const correction=getExamCorrection(student.id);let bonus=0;if(correction.extras?.stage) bonus+=1;if(correction.extras?.custom) bonus+=1;return bonus;}
function calculateExamFinalScore(student){return calculateExamBaseScore(student)+calculateExamExtraPoints(student);}
function getExamResult(student){const finalScore=calculateExamFinalScore(student);if(finalScore>=EXAM_PASS_POINTS) return"passed";if(finalScore>0) return"failed";return"pending";}
function getExamResultLabel(result){if(result==="passed") return"Approuvé";if(result==="failed") return"Refusé";return"En attente";}

// ================== LOAD + RENDER ==================
async function loadExamStudents(){
  if(!examStatus||!examGrid||!examDetail) return;
  const user=await waitForProfUser();
  if(!user){examStatus.textContent="Connexion professeur requise.";return;}
  examStatus.textContent="Import des réponses d’examen depuis Google Sheets...";
  examGrid.innerHTML="";
  examDetail.classList.remove("show");
  try{
    await loadExamCorrections();
    const csvText=await(await fetch(examCsvUrl())).text();
    const rows=parseExamCSV(csvText);
    if(rows.length<2){examStatus.textContent="Aucune réponse d’examen trouvée.";return;}
    const headers=rows[0].map(h=>h.trim());
    const questionHeaders=headers.map((header,i)=>({header,index:i})).filter(item=>item.header&&!isExamMetaColumn(item.header));
    const imported=[];
    rows.slice(1).forEach((row,i)=>{
      const name=getExamName(row,headers);
      const uniqueId=getExamUniqueId(row,headers);
      if(!name&&!uniqueId) return;
      const studentId=`exam-${i+2}-${uniqueId||name}`;
      const questions=questionHeaders.map((item,idx)=>({label:item.header, answer:row[item.index]||"", maxPoints:getExamQuestionMaxPoints(idx)}));
      imported.push({id:studentId,rowNumber:i+2,name,uniqueId,questions});
    });
    allExamStudents=imported;
    renderExamStudents();
  }catch(err){console.error(err);examStatus.textContent="Erreur : impossible d’importer l’examen ou les corrections.";}
}

function renderExamStudents(){
  if(!examStatus||!examGrid) return;
  examStatus.textContent=`${allExamStudents.length} réponse(s) d’examen affichée(s).`;
  if(!allExamStudents.length){examGrid.innerHTML=`<div class="exam-empty-card"><h4>Aucune réponse</h4><p>Aucune ligne trouvée dans le Google Sheets de l’examen.</p></div>`;return;}
  examGrid.innerHTML=allExamStudents.map(student=>{
    const baseScore=calculateExamBaseScore(student);
    const extraPoints=calculateExamExtraPoints(student);
    const finalScore=calculateExamFinalScore(student);
    const result=getExamResult(student);
    return `<button class="exam-student-card ${result}" onclick="openExamDetail('${examEscapeHTML(student.id)}')">
      <small>Examen mécanique</small>
      <h4>${examEscapeHTML(student.name)}</h4>
      <p>ID ${examEscapeHTML(student.uniqueId)}</p>
      <div class="exam-score-row"><span>${finalScore}/${EXAM_MAX_POINTS}</span><b class="${result}">${getExamResultLabel(result)}</b></div>
      <div class="exam-bonus-line">Base : ${baseScore}/${EXAM_MAX_POINTS} · Bonus : +${extraPoints}</div>
    </button>`;
  }).join("");
}

// ================== EXPORT ==================
window.loadExamStudents=loadExamStudents;
window.renderExamStudents=renderExamStudents;
