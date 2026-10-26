import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { HyperFormula } from 'hyperformula';
const fail = message => { throw new Error(message); };
const formula = c => c.type===ExcelJS.ValueType.Formula ? c.formula : null;
const key = (s,a)=>s+'!'+a;
export async function readWorkbook(bytes) {
 if(bytes.byteLength>8*1024*1024)fail('File exceeds 8 MB. Use a smaller .xlsx file.');
 let zip;try{zip=await JSZip.loadAsync(bytes);}catch{fail('Save this file as an unencrypted .xlsx workbook in Excel.');}
 let size=0;for(const [name,file] of Object.entries(zip.files)){
 size+=file._data?.uncompressedSize||0;
 if(size>40*1024*1024)fail('Workbook expands beyond the 40 MB safety limit.');
 if(/xl\/(externalLinks|pivot|charts|drawings|embeddings|slicer|activeX)|vbaProject|customXml/i.test(name))fail('Charts, drawings, pivots, macros and external links are not supported. Use a simple .xlsx template.');
 }
 const wb=new ExcelJS.Workbook();try{await wb.xlsx.load(bytes);}catch{fail('Cannot read workbook. Save a fresh .xlsx copy in Excel.');}
 if(!wb.worksheets.length||wb.worksheets.length>12)fail('Use 1–12 worksheets.');
 let count=0;for(const ws of wb.worksheets){
 if(ws.rowCount*ws.columnCount>30000)fail('Use at most 30,000 cells per template.');
 ws.eachRow(r=>r.eachCell(c=>{count++;if(c.value?.error)fail('Fix Excel error at '+key(ws.name,c.address));}));
 }
 if(count>30000)fail('Use at most 30,000 populated cells.');
 if(wb.definedNames.model.some(n=>!n.name.startsWith('_xlnm.')))fail('Replace named ranges with explicit cell references before uploading.');
 return wb;
}
function engine(wb){
 const sheets={};for(const ws of wb.worksheets){
 const rows=[];for(let r=1;r<=ws.rowCount;r++){
 const row=[];for(let c=1;c<=ws.columnCount;c++){
 const cell=ws.getCell(r,c),f=formula(cell),v=cell.value;
 if(f&&/\b(NOW|TODAY|RAND|RANDBETWEEN|INDIRECT|OFFSET|WEBSERVICE|HYPERLINK)\s*\(/i.test(f))fail('Replace volatile or dynamic formula at '+key(ws.name,cell.address));
 row.push(f?'='+f:v instanceof Date?v.getTime()/86400000+(wb.properties.date1904?24107:25569):typeof v==='number'||typeof v==='boolean'?v:v===null?null:"'"+cell.text);
 }rows.push(row);
 }sheets[ws.name]=rows;}
 return HyperFormula.buildFromSheets(sheets,{licenseKey:'gpl-v3',maxRows:30000,maxColumns:1000});
}
function calculate(wb,cached=false){
 const hf=engine(wb),results=[];try{
 for(const ws of wb.worksheets)ws.eachRow(r=>r.eachCell(c=>{
 const f=formula(c);if(!f)return;
 const result=hf.getCellValue({sheet:hf.getSheetId(ws.name),row:c.row-1,col:c.col-1});
 if(result&&typeof result==='object')fail('Cannot calculate '+key(ws.name,c.address)+' ('+(result.value||result.type)+'). Unsupported formula, circular reference or invalid data.');
 if(result===null||typeof result==='number'&&!Number.isFinite(result))fail('Invalid answer at '+key(ws.name,c.address));
 const old=c.result;
 if(cached&&old!==undefined&&old!==null&&(typeof old==='number'?typeof result!=='number'||Math.abs(result-old)>1e-7*Math.max(1,Math.abs(old)):old!==result))fail('Recalculated answer differs from the saved Excel answer at '+key(ws.name,c.address)+'. Recalculate and save the solution in Excel, or use a supported formula.');
 results.push({sheet:ws.name,address:c.address,formula:f,result});
 }));
 }finally{hf.destroy();}return results;
}
export async function analyze(taskBytes,solutionBytes){
 const task=await readWorkbook(taskBytes),solution=await readWorkbook(solutionBytes);
 if(task.worksheets.map(w=>w.name).join('\0')!==solution.worksheets.map(w=>w.name).join('\0'))fail('Task and solution must have the same sheet names and order.');
 const inputs=[],answers=[];
 for(const tw of task.worksheets){
 if(tw.state!=='visible')fail('Unhide and inspect all task worksheets before uploading.');
 if(tw.columns.some(c=>c.hidden))fail('Unhide task columns before uploading.');
 tw.eachRow(r=>{if(r.hidden)fail('Unhide task rows before uploading.');});
 const sw=solution.getWorksheet(tw.name);
 if(JSON.stringify(tw.model.merges)!==JSON.stringify(sw.model.merges))fail('Merged cells differ on '+tw.name);
 for(let r=1;r<=Math.max(tw.rowCount,sw.rowCount);r++)for(let c=1;c<=Math.max(tw.columnCount,sw.columnCount);c++){
 const t=tw.getCell(r,c),s=sw.getCell(r,c),f=formula(s);
 if(t.isMerged&&t.master.address!==t.address)continue;
 if(formula(t))fail('Remove formulas from the task file at '+key(tw.name,t.address)+'. Student answer cells must be empty.');
 if(f){if(t.value!==null)fail('Solution formula overlaps task content at '+key(tw.name,t.address));answers.push({sheet:tw.name,address:s.address});}
 else if(t.value===null&&s.value!==null)fail('Hardcoded answer or extra content at '+key(tw.name,s.address)+'. Answers must use formulas; labels must appear in both files.');
 else if(t.value!==null){
 if(typeof t.value==='number'){
 if(s.value!==t.value)fail('Source numbers differ at '+key(tw.name,t.address));
 if(!/[dy]/i.test((t.numFmt||'General').replace(/"[^"]*"/g,''))&&t.value!==0)inputs.push({sheet:tw.name,address:t.address,value:t.value,label:tw.getCell(r,Math.max(1,c-1)).text});
 }else if(t.text!==s.text)fail('Task text differs at '+key(tw.name,t.address));
 }
 }}
 if(!answers.length)fail('No formula answers found. The solution needs formulas in the task’s empty answer cells.');
 calculate(solution,true);
 const hf=engine(solution),deps=new Set(),visited=new Set();
 try{
 const visit=a=>{
 const id=a.sheet+':'+a.row+':'+a.col;if(visited.has(id))return;visited.add(id);
 const ws=solution.getWorksheet(hf.getSheetName(a.sheet));
 deps.add(key(ws.name,ws.getCell(a.row+1,a.col+1).address));
 for(const d of hf.getCellPrecedents(a)){
 if('start' in d){const dw=solution.getWorksheet(hf.getSheetName(d.start.sheet));for(let r=d.start.row;r<=Math.min(d.end.row,dw.rowCount-1);r++)for(let c=d.start.col;c<=Math.min(d.end.col,dw.columnCount-1);c++)visit({sheet:d.start.sheet,row:r,col:c});}
 else visit(d);
 }};
 answers.forEach(a=>{const c=solution.getWorksheet(a.sheet).getCell(a.address);visit({sheet:hf.getSheetId(a.sheet),row:c.row-1,col:c.col-1});});
 }finally{hf.destroy();}
 const candidates=inputs.filter(i=>deps.has(key(i.sheet,i.address))).map(i=>({...i,min:Math.round(Math.min(i.value*.8,i.value*1.2)*1e6)/1e6,max:Math.round(Math.max(i.value*.8,i.value*1.2)*1e6)/1e6,decimals:Number.isInteger(i.value)?0:2,enabled:true}));
 if(!candidates.length)fail('No numeric inputs feed the formulas. Check your source data.');
 return {candidates,answers,sheets:task.worksheets.map(w=>({name:w.name,rows:w.rowCount,columns:w.columnCount})),cachedVerified:answers.filter(a=>solution.getWorksheet(a.sheet).getCell(a.address).result!==undefined).length};
}
export async function generate(taskBytes,solutionBytes,options,onProgress=()=>{}){
 const analysis=await analyze(taskBytes,solutionBytes),{count=1,seed='classroom',inputs=[]}=options;
 if(!Number.isInteger(count)||count<1||count>40)fail('Choose 1–40 variants.');
 const allowed=new Map(analysis.candidates.map(i=>[key(i.sheet,i.address),i])),active=inputs.filter(i=>i.enabled);
 if(!active.length)fail('Select at least one input to change.');
 if(new Set(active.map(i=>key(i.sheet,i.address))).size!==active.length)fail('Duplicate input cell.');
 for(const i of active){
 if(!allowed.has(key(i.sheet,i.address))||!Number.isFinite(i.min)||!Number.isFinite(i.max)||i.min>=i.max||!Number.isInteger(i.decimals)||i.decimals<0||i.decimals>6)fail('Check input ranges and decimal precision (0–6).');
 i.value=allowed.get(key(i.sheet,i.address)).value;
 }
 let state=2166136261;for(const c of String(seed))state=Math.imul(state^c.charCodeAt(0),16777619)>>>0;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const students=[],seen=new Set(),answerKey=new ExcelJS.Workbook();
 const index=answerKey.addWorksheet('Answers');index.addRow(['Variant','Worksheet','Cell','Correct answer','Original formula']);
 const manifest=answerKey.addWorksheet('Inputs');manifest.addRow(['Variant','Worksheet','Cell','Original','Generated','Seed']);
 for(let n=1;n<=count;n++){
 let values,signature;
 for(let a=0;a<200;a++){
 values=active.map(i=>{const scale=10**i.decimals,lo=Math.ceil(i.min*scale),hi=Math.floor(i.max*scale);if(hi<lo)fail('No values in the selected range at this precision.');return(lo+Math.floor(random()*(hi-lo+1)))/scale;});
 signature=JSON.stringify(values);
 if(!seen.has(signature)&&values.some((v,j)=>v!==active[j].value))break;signature=null;
 }
 if(!signature)fail('Not enough unique combinations. Widen ranges or reduce the variant count.');
 seen.add(signature);
 const task=await readWorkbook(taskBytes),solution=await readWorkbook(solutionBytes),variant='Variant '+String(n).padStart(2,'0');
 active.forEach((i,j)=>{task.getWorksheet(i.sheet).getCell(i.address).value=values[j];solution.getWorksheet(i.sheet).getCell(i.address).value=values[j];manifest.addRow([variant,i.sheet,i.address,i.value,values[j],String(seed)]);});
 const results=calculate(solution),nameMap=new Map(solution.worksheets.map((w,j)=>[w.name,'V'+String(n).padStart(2,'0')+'_'+(j+1)]));
 for(const ws of solution.worksheets){
 const name=nameMap.get(ws.name),target=answerKey.addWorksheet(name);
 target.model={...structuredClone(ws.model),id:target.id,name};target.state='visible';
 ws.eachRow(r=>r.eachCell(c=>{
 if(!formula(c))return;let f=formula(c);
 // Rewrite sheet reference tokens only, never strings inside Excel formulas.
 const tokens=f.split(/("(?:[^"]|"")*")/g);
 for(let ti=0;ti<tokens.length;ti+=2){
 for(const [old,renamed] of nameMap){
 const quoted="'"+old.replaceAll("'","''")+"'!";
 tokens[ti]=tokens[ti].split(quoted).join("'"+renamed+"'!");
 if(/^[A-Za-z_][A-Za-z0-9_]*$/.test(old))tokens[ti]=tokens[ti].replace(new RegExp("(?<![A-Za-z0-9_'])"+old+"!",'g'),"'"+renamed+"'!");
 }}
 f=tokens.join('');
 const result=results.find(a=>a.sheet===ws.name&&a.address===c.address).result;
 target.getCell(c.address).value={formula:f,result};
 index.addRow([variant,ws.name,c.address,result,'='+formula(c)]);
 }));
 }
 task.worksheets.forEach(ws=>ws.eachRow(r=>r.eachCell(c=>{delete c.note;if(formula(c))fail('Unexpected formula in student file.');})));
 task.creator='Classroom Studio';task.title=variant;task.subject=variant;task.calcProperties.fullCalcOnLoad=true;
 const bytes=await task.xlsx.writeBuffer(),check=await readWorkbook(bytes);
 for(const a of analysis.answers)if(check.getWorksheet(a.sheet).getCell(a.address).value!==null)fail('Answer cell is not empty.');
 students.push({name:'Variant_'+String(n).padStart(2,'0')+'.xlsx',bytes});
 onProgress(n,count);await new Promise(r=>setTimeout(r,0));
 }
 for(const ws of[index,manifest]){ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF245B47'}};ws.views=[{state:'frozen',ySplit:1}];ws.columns.forEach((c,i)=>c.width=i===4?48:22);}
 answerKey.calcProperties.fullCalcOnLoad=true;
 // Verify combined formulas before export; readWorkbook's input limits do not apply to aggregated output.
 calculate(answerKey);
 const answerBytes=await answerKey.xlsx.writeBuffer(),zip=new JSZip();
 for(const student of students)zip.file(student.name,student.bytes);
 return {students,answerBytes,zipBytes:await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),analysis};
}
export async function demoFiles(){
 const task=new ExcelJS.Workbook(),ws=task.addWorksheet('Business');
 ws.addRows([['BUSINESS SPREADSHEET — SALES ANALYSIS'],['Calculate the missing values using Excel formulas.'],[],['Product','Units','Unit price','Revenue'],['Notebook',120,8.5,null],['Pen',250,1.2,null],['Folder',90,3.4,null],['Total',null,null,null],[],['Discount rate',.1],['Net revenue',null]]);
 ws.columns=[{width:48},{width:18},{width:18},{width:20}];ws.mergeCells('A1:D1');ws.getRow(1).height=32;ws.getRow(1).font={bold:true,size:16};
 ws.getRow(4).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(4).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF245B47'}};
 for(const a of['D5','D6','D7','D8','B11']){ws.getCell(a).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF3D9'}};ws.getCell(a).numFmt='0.00';}ws.getCell('B10').numFmt='0%';
 const taskBytes=await task.xlsx.writeBuffer(),solution=await readWorkbook(taskBytes),s=solution.getWorksheet('Business');
 for(const a of['D5','D6','D7'])s.getCell(a).value={formula:'B'+a.slice(1)+'*C'+a.slice(1)};
 s.getCell('D8').value={formula:'SUM(D5:D7)'};s.getCell('B11').value={formula:'D8*(1-B10)'};
 for(const r of calculate(solution))s.getCell(r.address).value={formula:r.formula,result:r.result};
 return{taskBytes,solutionBytes:await solution.xlsx.writeBuffer()};
}
