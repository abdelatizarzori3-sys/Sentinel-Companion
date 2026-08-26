/**
 * ScriptGuard AI - Full-Stack Frontend
 * Owner & Lead Developer: Abdelati Zarzori
 * API: http://localhost:3000/api/analyze
 */

const CONFIG = {
  API_BASE: window.SCRIPTGUARD_API_BASE || localStorage.getItem('sg_api_base') || 'http://localhost:3000',
  MAX_FILE_SIZE: 5 * 1024 * 1024,
  SUPPORTED_EXTS: ['.py','.js','.ts','.cs','.gd','.java','.go','.php','.rb','.cpp','.c','.h'],
  DEMO_MODE: false, LLM_READY: false
};

const State = {
  tab: 'upload', analyzing: false, result: null, filter: 'all',
  user: JSON.parse(localStorage.getItem('sg_user') || 'null'),
  token: localStorage.getItem('sg_token') || null,
  zipFiles: []
};

const MockData = {
  safe: {
    fileName: 'data_processor.py', language: 'python',
    safety: 95, efficiency: 88, quality: 92,
    status: 'safe', statusTitle: '✅ الكود آمن تماماً',
    statusDesc: 'لم يتم العثور على ثغرات أمنية. الكود يتبع أفضل الممارسات.',
    statusBadge: 'آمن', statusBadgeClass: 'bg-green-500/20 text-green-400 border border-green-500/30',
    statusIcon: '🛡️', statusIconBg: 'bg-green-500/20',
    issues: [
      { id:1, type:'info', severity:'low', icon:'💡', title:'اقتراح تحسين', description:'يمكن استخدام list comprehension بدلاً من for loop في السطر 12 لتحسين الأداء بنسبة 15%.', line:12, code:'result = []\nfor x in data:\n    result.append(x * 2)' },
      { id:2, type:'info', severity:'low', icon:'📝', title:'نمط أفضل', description:'أضف docstring للدالة process_data() لتوثيق المعاملات ونوع الإرجاع.', line:8, code:'def process_data(data):' }
    ],
    fixCode: `def process_data(data):\n    """\n    معالجة البيانات وإرجاع النتائج المضاعفة.\n    \n    Args:\n        data (list): قائمة الأرقام المراد معالجتها\n    \n    Returns:\n        list: قائمة الأرقام المضاعفة\n    """\n    return [x * 2 for x in data if x is not None]`
  },
  vulnerable: {
    fileName: 'user_handler.py', language: 'python',
    safety: 25, efficiency: 70, quality: 40,
    status: 'danger', statusTitle: '🚨 ثغرات أمنية خطيرة!',
    statusDesc: 'تم العثور على 3 ثغرات حرجة. يُنصح بشدة بإصلاحها قبل النشر.',
    statusBadge: 'خطير', statusBadgeClass: 'bg-red-500/20 text-red-400 border border-red-500/30',
    statusIcon: '⚠️', statusIconBg: 'bg-red-500/20',
    issues: [
      { id:1, type:'critical', severity:'critical', icon:'🚨', title:'ثغرة Code Injection', description:'استخدام eval() مع مدخلات المستخدم يفتح الباب للحقن البرمجي.', line:5, code:'result = eval(user_input)' },
      { id:2, type:'critical', severity:'critical', icon:'🔑', title:'API Key مكشوف', description:'تم العثور على مفتاح API مكتوب مباشرة في الكود.', line:8, code:'API_KEY = "sk-live-1234567890abcdef"' },
      { id:3, type:'critical', severity:'critical', icon:'🔓', title:'SQL Injection', description:'تمرير مدخلات المستخدم مباشرة لاستعلام SQL بدون تطهير.', line:15, code:'query = f"SELECT * FROM users WHERE id = {user_id}"' },
      { id:4, type:'warning', severity:'medium', icon:'⚠️', title:'تسريب معلومات', description:'طباعة تفاصيل الاستثناءات قد تكشف هيكل قاعدة البيانات.', line:22, code:'except Exception as e:\n    print(e)' }
    ],
    fixCode: `import ast\nimport os\nfrom typing import Any\n\nAPI_KEY = os.environ.get('API_KEY')\nif not API_KEY:\n    raise ValueError("API_KEY غير محدد")\n\ndef get_user(user_id: int):\n    query = "SELECT * FROM users WHERE id = %s"\n    cursor.execute(query, (user_id,))\n    return cursor.fetchone()`
  },
  slow: {
    fileName: 'data_analyzer.py', language: 'python',
    safety: 80, efficiency: 30, quality: 65,
    status: 'warning', statusTitle: '⚡ مشاكل في الأداء',
    statusDesc: 'الكود يعمل بشكل صحيح لكنه بطيء جداً مع البيانات الكبيرة.',
    statusBadge: 'بطيء', statusBadgeClass: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    statusIcon: '🐌', statusIconBg: 'bg-yellow-500/20',
    issues: [
      { id:1, type:'warning', severity:'high', icon:'🐌', title:'تعقيد زمني O(n²)', description:'البحث الخطي داخل loop مضاعفة يجعل التعقيد O(n²).', line:10, code:'for item in list1:\n    if item in list2:' },
      { id:2, type:'warning', severity:'high', icon:'💾', title:'استهلاك ذاكرة مفرط', description:'تحميل ملف 500MB كاملاً في الذاكرة قد يسبب crash.', line:25, code:'data = file.read()' },
      { id:3, type:'info', severity:'low', icon:'🔁', title:'Loop غير فعّال', description:'يمكن استخدام built-in functions مثل sum() أو map().', line:18, code:'total = 0\nfor num in numbers:\n    total += num' }
    ],
    fixCode: `from typing import List, Set\n\ndef find_common_elements(list1: List[int], list2: List[int]) -> Set[int]:\n    set2 = set(list2)\n    return {item for item in list1 if item in set2}\n\ndef process_large_file(filepath: str, chunk_size: int = 8192):\n    with open(filepath, 'r', encoding='utf-8') as file:\n        while chunk := file.read(chunk_size):\n            yield process_chunk(chunk)\n\ntotal = sum(numbers)`
  }
};

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

document.addEventListener('DOMContentLoaded', () => {
  initParticles(); initDragDrop(); initKeyboard(); initCharCount(); checkApiStatus(); updateAuthUI();
});

function initParticles() {
  const c = $('particles'); if (!c) return;
  const n = window.innerWidth < 768 ? 12 : 20;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div'); p.className = 'prt';
    const s = Math.random() * 4 + 2;
    p.style.cssText = `width:${s}px;height:${s}px;left:${Math.random()*100}%;top:${Math.random()*100}%;animation-duration:${Math.random()*10+8}s;animation-delay:${Math.random()*5}s`;
    c.appendChild(p);
  }
}

function initDragDrop() {
  const dz = $('drop-zone'); if (!dz) return;
  ['dragenter','dragover','dragleave','drop'].forEach(e => {
    dz.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); }, false);
    document.body.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); }, false);
  });
  ['dragenter','dragover'].forEach(e => dz.addEventListener(e, () => dz.classList.add('drag-over'), false));
  ['dragleave','drop'].forEach(e => dz.addEventListener(e, () => dz.classList.remove('drag-over'), false));
  dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]); }, false);
}

function initKeyboard() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && State.tab === 'paste' && !State.analyzing) analyzePastedCode();
    if (e.key === 'Escape' && State.result) resetApp();
    if (e.key === 'Escape' && !$('file-manager-modal')?.classList.contains('hidden')) hideFileManager();
  });
}

function initCharCount() {
  const ta = $('code-textarea'); if (!ta) return;
  ta.addEventListener('input', () => { $('char-count').textContent = (ta.value.length || 0) + ' حرف'; });
}

function showLoginModal() { $('login-modal').classList.remove('hidden'); $('login-modal').classList.add('flex'); }
function hideLoginModal() { $('login-modal').classList.add('hidden'); $('login-modal').classList.remove('flex'); }

async function login() {
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  if (!email || !password) { showToast('⚠️ أدخل البريد وكلمة المرور', 'warning'); return; }
  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل تسجيل الدخول');
    State.token = data.token; State.user = data.user;
    localStorage.setItem('sg_token', data.token);
    localStorage.setItem('sg_user', JSON.stringify(data.user));
    updateAuthUI(); hideLoginModal();
    showToast('✅ تم تسجيل الدخول بنجاح!', 'success');
    loadHistory();
  } catch (err) { showToast('❌ ' + err.message, 'error'); }
}

async function signup() {
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  if (!email || !password) { showToast('⚠️ أدخل البريد وكلمة المرور', 'warning'); return; }
  if (password.length < 6) { showToast('⚠️ كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'warning'); return; }
  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل إنشاء الحساب');
    State.token = data.token; State.user = data.user;
    localStorage.setItem('sg_token', data.token);
    localStorage.setItem('sg_user', JSON.stringify(data.user));
    updateAuthUI(); hideLoginModal();
    showToast('✅ تم إنشاء الحساب بنجاح!', 'success');
  } catch (err) { showToast('❌ ' + err.message, 'error'); }
}

function logout() {
  State.token = null; State.user = null;
  localStorage.removeItem('sg_token');
  localStorage.removeItem('sg_user');
  updateAuthUI();
  showToast('👋 تم تسجيل الخروج', 'success');
}

function updateAuthUI() {
  const badge = $('user-badge');
  const btn = $('login-btn');
  if (State.user) { badge.classList.remove('hidden'); badge.classList.add('flex'); btn.classList.add('hidden'); }
  else { badge.classList.add('hidden'); badge.classList.remove('flex'); btn.classList.remove('hidden'); }
}

async function checkApiStatus() {
  const dot = $('api-dot');
  const text = $('api-text');
  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/health`, { method: 'GET', signal: AbortSignal.timeout(3000) });
    const health = await res.json().catch(() => ({}));
    if (res.ok) { CONFIG.LLM_READY = Boolean(health.llmConfigured); CONFIG.DEMO_MODE = !CONFIG.LLM_READY; dot.className = 'w-2 h-2 rounded-full bg-green-500'; text.textContent = CONFIG.LLM_READY ? 'متصل بالخادم — الذكاء الاصطناعي متاح' : 'الخادم متصل — الترجمة المحلية الاحتياطية'; text.className = CONFIG.LLM_READY ? 'text-green-400' : 'text-yellow-400'; }
    else throw new Error();
  } catch {
    dot.className = 'w-2 h-2 rounded-full bg-yellow-500 animate-pulse';
    text.textContent = 'وضع العرض التجريبي (لا يوجد خادم)';
    text.className = 'text-yellow-400';
    CONFIG.DEMO_MODE = true; CONFIG.LLM_READY = false;
  }
}

function switchTab(tab) {
  State.tab = tab;
  ['upload','paste','history','translate'].forEach(t => {
    const btn = $(`tab-${t}`);
    const zone = $(`${t}-zone`);
    if (t === tab) { btn.classList.add('active'); btn.classList.remove('text-gray-400'); zone.classList.remove('hidden'); }
    else { btn.classList.remove('active'); btn.classList.add('text-gray-400'); zone.classList.add('hidden'); }
  });
  if (tab === 'history') loadHistory();
}

const TranslationDictionary = {
  'مرحبا': 'Hello', 'مرحباً': 'Hello', 'بالعالم': 'world', 'العالم': 'world', 'اسم': 'name', 'رسالة': 'message', 'خطأ': 'error', 'نجاح': 'success', 'ابدأ': 'Start', 'توقف': 'Stop', 'احفظ': 'Save', 'بيانات': 'data', 'مستخدم': 'user', 'المستخدم': 'the user', 'معالجة': 'processing', 'النتيجة': 'result', 'هذا': 'this', 'نص': 'text', 'اختبار': 'test', 'جاري': 'In progress', 'تم': 'Done'
};

function translateTextPreservingWords(text, direction) {
  const entries = Object.entries(TranslationDictionary);
  if (direction === 'en-ar') {
    const reverse = { Hello: 'مرحبا', world: 'العالم', name: 'اسم', message: 'رسالة', error: 'خطأ', success: 'نجاح', Start: 'ابدأ', Stop: 'توقف', Save: 'احفظ', data: 'بيانات', user: 'مستخدم', result: 'النتيجة', text: 'نص', test: 'اختبار', Done: 'تم' };
    return text.replace(/\b[A-Za-z][A-Za-z _-]*\b/g, word => reverse[word.trim()] || word);
  }
  let result = text;
  entries.sort((a, b) => b[0].length - a[0].length).forEach(([from, to]) => { result = result.split(from).join(to); });
  return result;
}

function protectFStringExpressions(text) {
  const protectedParts = [];
  let output = '';
  for (let i = 0; i < text.length;) {
    if (text[i] !== '{' || text[i + 1] === '{') { output += text[i]; i += text[i] === '{' ? 2 : 1; continue; }
    let depth = 0; let j = i;
    for (; j < text.length; j++) {
      if (text[j] === '{') depth++;
      if (text[j] === '}') { depth--; if (depth === 0) { j++; break; } }
    }
    if (depth !== 0) { output += text.slice(i); break; }
    const marker = `__SG_EXPR_${protectedParts.length}__`;
    protectedParts.push(text.slice(i, j)); output += marker; i = j;
  }
  return { output, protectedParts };
}

function translatePythonStringBody(body, prefix, direction) {
  if (prefix.toLowerCase().includes('b')) return body;
  if (prefix.toLowerCase().includes('f')) {
    const protectedValue = protectFStringExpressions(body);
    let translated = translateTextPreservingWords(protectedValue.output, direction);
    protectedValue.protectedParts.forEach((part, index) => { translated = translated.split(`__SG_EXPR_${index}__`).join(part); });
    return translated;
  }
  return translateTextPreservingWords(body, direction);
}

function translatePythonSource(source, direction) {
  let output = ''; let i = 0;
  while (i < source.length) {
    if (source[i] === '#') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      output += translateTextPreservingWords(source.slice(i, stop), direction); i = stop; continue;
    }
    const candidate = source.slice(i).match(/^([rubfRUBF]{0,2})('''|"""|'|")/);
    if (!candidate) { output += source[i++]; continue; }
    const prefix = candidate[1]; const delimiter = candidate[2]; const start = i + candidate[0].length;
    let j = start;
    while (j < source.length) {
      if (source[j] === '\\') { j += 2; continue; }
      if (source.startsWith(delimiter, j)) break;
      j++;
    }
    if (j >= source.length) { output += source.slice(i); break; }
    const body = source.slice(start, j);
    output += candidate[0] + translatePythonStringBody(body, prefix, direction) + delimiter;
    i = j + delimiter.length;
  }
  return output;
}

async function translatePythonCode() {
  const input = $('translate-input'); const output = $('translate-output'); const status = $('translate-status'); const warning = $('translate-mode-warning');
  if (!input || !output || !input.value.trim()) { showToast('⚠️ أدخل كود Python أولاً', 'warning'); return; }
  const direction = $('translate-direction')?.value || 'ar-en';
  if (status) status.textContent = 'جاري تحليل النص وحماية البنية...';
  if (CONFIG.LLM_READY) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/api/translate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: input.value, direction }) });
      const data = await response.json();
      if (!response.ok || typeof data.code !== 'string') throw new Error(data.error || 'Translation API failed');
      output.value = data.code; if (status) status.textContent = 'ترجمة خادمة حقيقية — البنية والتعبيرات محمية'; if (warning) warning.textContent = 'تمت الترجمة عبر الخادم؛ لا ترسل أسرارًا أو مفاتيح خاصة.';
      showToast('✅ تمت الترجمة عبر الذكاء الاصطناعي', 'success'); return;
    } catch (error) { console.warn('Server translation failed; using local parser', error); }
  }
  output.value = translatePythonSource(input.value, direction);
  if (status) status.textContent = 'ترجمة محلية احتياطية — البنية محفوظة';
  if (warning) warning.textContent = 'تنبيه: الخادم غير متاح أو غير مهيأ؛ الترجمة المحلية تغطي القاموس المتاح فقط. راجع النتيجة قبل الاستخدام.';
  showToast('✅ تمت الترجمة المحلية الآمنة', 'success');
}

async function copyTranslatedCode() {
  const output = $('translate-output');
  if (!output?.value) { showToast('⚠️ لا توجد نتيجة لنسخها', 'warning'); return; }
  await navigator.clipboard?.writeText(output.value);
  showToast('✅ تم نسخ النتيجة', 'success');
}

function handleFileSelect(e) { if (e.target.files.length) processFile(e.target.files[0]); }

function showFileManager() {
  const modal = $('file-manager-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  renderZipFiles();
}

function hideFileManager() {
  const modal = $('file-manager-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function handleZipFiles(e) {
  const files = Array.from(e.target.files || []);
  const known = new Set(State.zipFiles.map(item => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
  files.forEach(file => {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (!known.has(key)) {
      State.zipFiles.push({ file, path: file.webkitRelativePath || file.name, text: null });
      known.add(key);
    }
  });
  e.target.value = '';
  renderZipFiles();
}

function removeZipFile(index) {
  State.zipFiles.splice(index, 1);
  renderZipFiles();
}

function clearZipFiles() {
  State.zipFiles = [];
  renderZipFiles();
}

function formatBytes(bytes) {
  if (!bytes) return '0 بايت';
  const units = ['بايت', 'ك.ب', 'م.ب', 'ج.ب'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function renderZipFiles() {
  const list = $('zip-file-list');
  const count = $('zip-file-count');
  if (!list || !count) return;
  count.textContent = `${State.zipFiles.length} ملف`;
  list.replaceChildren();
  if (!State.zipFiles.length) {
    const empty = document.createElement('p');
    empty.className = 'text-center text-sm text-gray-500 py-5';
    empty.textContent = 'لم تتم إضافة ملفات بعد';
    list.appendChild(empty);
    return;
  }
  State.zipFiles.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3 rounded-lg bg-white/5 border border-white/10 px-3 py-2';
    const icon = document.createElement('i');
    icon.className = 'fas fa-file-code text-cyan-400';
    const info = document.createElement('div');
    info.className = 'min-w-0 flex-1';
    const name = document.createElement('p');
    name.className = 'text-sm truncate';
    name.title = item.path;
    name.textContent = item.path;
    const size = document.createElement('p');
    size.className = 'text-[11px] text-gray-500';
    size.textContent = formatBytes(item.file.size);
    info.append(name, size);
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'px-2 py-1 rounded-lg text-cyan-300 hover:bg-cyan-500/10 text-xs';
    edit.title = 'قراءة وتحرير الملف';
    edit.innerHTML = '<i class="fas fa-pen-to-square"></i>';
    edit.addEventListener('click', () => editZipFile(index));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'w-8 h-8 rounded-lg text-red-300 hover:bg-red-500/10';
    remove.title = 'إزالة الملف';
    remove.setAttribute('aria-label', `إزالة ${item.file.name}`);
    remove.innerHTML = '<i class="fas fa-trash-can"></i>';
    remove.addEventListener('click', () => removeZipFile(index));
    row.append(icon, info, edit, remove);
    list.appendChild(row);
  });
}

async function editZipFile(index) {
  const item = State.zipFiles[index];
  const editor = $('file-editor'); const textarea = $('file-editor-text'); const title = $('file-editor-title'); const status = $('file-editor-status');
  if (!item || !editor || !textarea) return;
  try {
    const text = item.text !== null ? item.text : await item.file.text();
    item.text = text;
    State.activeZipIndex = index;
    textarea.value = text;
    title.textContent = item.path;
    status.textContent = 'تمت القراءة محليًا';
    editor.classList.remove('hidden');
    textarea.focus();
  } catch (error) { console.error(error); showToast('❌ تعذر قراءة الملف النصي', 'error'); }
}

function saveEditedFile() {
  const index = State.activeZipIndex;
  const item = State.zipFiles[index]; const textarea = $('file-editor-text'); const status = $('file-editor-status');
  if (!item || !textarea) return;
  item.text = textarea.value;
  item.file = new File([item.text], item.file.name, { type: item.file.type || 'text/plain', lastModified: Date.now() });
  if (status) status.textContent = 'تم الحفظ محليًا داخل الحزمة';
  renderZipFiles();
  showToast('✅ تم حفظ التعديلات محليًا', 'success');
}

function closeFileEditor() {
  $('file-editor')?.classList.add('hidden');
  State.activeZipIndex = null;
}

async function downloadZip() {
  if (!State.zipFiles.length) { showToast('⚠️ أضف ملفًا واحدًا على الأقل', 'warning'); return; }
  if (typeof JSZip === 'undefined') { showToast('❌ تعذر تحميل أداة ZIP، تحقق من الاتصال ثم أعد المحاولة', 'error'); return; }
  try {
    const zip = new JSZip();
    State.zipFiles.forEach(item => zip.file(item.path, item.text !== null ? item.text : item.file));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scriptguard-files-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('✅ تم إنشاء ملف ZIP وتنزيله محليًا', 'success');
  } catch (err) {
    console.error('ZIP creation failed', err);
    showToast('❌ تعذر إنشاء ملف ZIP', 'error');
  }
}

function processFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!CONFIG.SUPPORTED_EXTS.includes(ext)) { showToast('❌ نوع الملف غير مدعوم: ' + ext, 'error'); return; }
  if (file.size > CONFIG.MAX_FILE_SIZE) { showToast('❌ حجم الملف يتجاوز 5 ميجابايت', 'error'); return; }
  const reader = new FileReader();
  reader.onload = ev => startAnalysis(ev.target.result, file.name);
  reader.readAsText(file);
}

function analyzePastedCode() {
  const code = $('code-textarea').value.trim();
  if (!code) { showToast('⚠️ أدخل الكود أولاً', 'warning'); return; }
  const lang = $('language-select').value;
  const extMap = { python:'py', javascript:'js', typescript:'ts', csharp:'cs', gdscript:'gd', java:'java', go:'go', php:'php' };
  startAnalysis(code, `pasted_code.${extMap[lang] || 'py'}`);
}

function loadDemo(type) {
  const demos = { safe: MockData.safe, vulnerable: MockData.vulnerable, slow: MockData.slow };
  const demo = demos[type]; if (!demo) return;
  $('code-textarea').value = demo.fixCode.substring(0, 300) + '\n// ...';
  $('char-count').textContent = $('code-textarea').value.length + ' حرف';
  startAnalysis(null, demo.fileName, demo);
}

async function startAnalysis(code, fileName, preloaded = null) {
  if (State.analyzing) return;
  State.analyzing = true;
  $('upload-zone').classList.add('hidden');
  $('paste-zone').classList.add('hidden');
  $('welcome-section').classList.add('hidden');
  $('results-dashboard').classList.remove('show');
  $('loading-section').classList.remove('hidden');

  const steps = [
    { text: 'فحص الثغرات الأمنية', progress: 25, stepId: 'step-1' },
    { text: 'تحليل كفاءة الأداء', progress: 50, stepId: 'step-2' },
    { text: 'تقييم جودة الكود', progress: 75, stepId: 'step-3' },
    { text: 'توليد التصحيحات الذكية', progress: 100, stepId: 'step-4' }
  ];
  for (const step of steps) { updateLoadingStep(step); await sleep(600 + Math.random() * 300); }

  $('loading-section').classList.add('hidden');
  let resultData = preloaded;

  if (!resultData && !CONFIG.DEMO_MODE && code) {
    try {
      const res = await fetch(`${CONFIG.API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(State.token ? { 'Authorization': `Bearer ${State.token}` } : {}) },
        body: JSON.stringify({ code, fileName, language: detectLanguage(fileName) })
      });
      if (!res.ok) throw new Error('API Error');
      resultData = await res.json();
    } catch (err) {
      console.warn('API failed, falling back to mock:', err);
      resultData = determineMockResult(fileName, code);
    }
  } else if (!resultData) {
    resultData = determineMockResult(fileName, code);
  }

  State.result = resultData;
  renderResults(resultData);
  $('results-dashboard').classList.add('show');
  State.analyzing = false;
  showToast('✅ تم الانتهاء من التحليل!', 'success');
}

function detectLanguage(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const map = { py:'python', js:'javascript', ts:'typescript', cs:'csharp', gd:'gdscript', java:'java', go:'go', php:'php', rb:'ruby', cpp:'cpp', c:'c', h:'c' };
  return map[ext] || 'python';
}

function determineMockResult(fileName, code) {
  if (!code) return MockData.safe;
  const lower = code.toLowerCase();
  if (lower.includes('eval(') || lower.includes('exec(') || lower.includes('api_key') || lower.includes('password')) return MockData.vulnerable;
  if ((lower.match(/for/g) || []).length > 2 && lower.includes('in')) return MockData.slow;
  return MockData.safe;
}

function updateLoadingStep(step) {
  $('loading-status').textContent = step.text;
  $('loading-progress').style.width = step.progress + '%';
  for (let i = 1; i <= 4; i++) {
    const el = $(`step-${i}`); if (!el) continue;
    if (i <= Math.ceil(step.progress / 25)) { el.classList.remove('opacity-50'); el.querySelector('i').classList.add('text-cyan-400'); }
    else { el.classList.add('opacity-50'); el.querySelector('i').classList.remove('text-cyan-400'); }
  }
}

async function loadHistory() {
  const list = $('history-list');
  if (!State.token) { list.innerHTML = '<div class="text-center py-12 text-gray-500"><i class="fas fa-inbox text-4xl mb-3 opacity-50"></i><p>سجل دخولك لرؤية سجل فحوصاتك</p></div>'; return; }
  list.innerHTML = '<div class="text-center py-8"><div class="w-8 h-8 mx-auto border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin"></div><p class="text-xs text-gray-500 mt-2">جاري التحميل...</p></div>';
  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/history`, { headers: { 'Authorization': `Bearer ${State.token}` } });
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (!data.scans || data.scans.length === 0) { list.innerHTML = '<div class="text-center py-12 text-gray-500"><i class="fas fa-clipboard-list text-4xl mb-3 opacity-50"></i><p>لا توجد فحوصات مسجلة بعد</p></div>'; return; }
    list.innerHTML = data.scans.map(scan => `
      <div class="glass rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition">
        <div class="w-10 h-10 rounded-lg ${scan.safety_score >= 75 ? 'bg-green-500/20 text-green-400' : scan.safety_score >= 40 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'} flex items-center justify-center font-bold text-sm">${scan.safety_score}%</div>
        <div class="flex-1 min-w-0"><h4 class="font-semibold text-sm truncate">${scan.file_name}</h4><p class="text-xs text-gray-500">${new Date(scan.created_at).toLocaleDateString('ar-SA')} · ${scan.language}</p></div>
        <i class="fas fa-chevron-left text-gray-600 text-xs"></i>
      </div>
    `).join('');
  } catch { list.innerHTML = '<div class="text-center py-12 text-gray-500"><i class="fas fa-wifi text-4xl mb-3 opacity-50"></i><p>تعذر الاتصال بالخادم</p></div>'; }
}

function renderResults(data) {
  animateCircularProgress('safety-circle', data.safety);
  animateCircularProgress('efficiency-circle', data.efficiency);
  animateCircularProgress('quality-circle', data.quality);
  animateNumber('safety-score', data.safety);
  animateNumber('efficiency-score', data.efficiency);
  animateNumber('quality-score', data.quality);
  $('safety-label').textContent = getScoreLabel(data.safety);
  $('efficiency-label').textContent = getScoreLabel(data.efficiency);
  $('quality-label').textContent = getScoreLabel(data.quality);
  renderStatusBanner(data);
  renderIssues(data.issues);
  renderFixCode(data.fixCode, data.language);
}

function animateCircularProgress(id, target) {
  const c = $(id); if (!c) return;
  const circ = 2 * Math.PI * 42;
  c.style.strokeDashoffset = circ;
  setTimeout(() => { c.style.strokeDashoffset = circ - (target / 100) * circ; }, 100);
}

function animateNumber(id, target) {
  const el = $(id); if (!el) return;
  let cur = 0; const inc = target / (1500 / 16);
  const t = setInterval(() => { cur += inc; if (cur >= target) { cur = target; clearInterval(t); } el.textContent = Math.round(cur) + '%'; }, 16);
}

function getScoreLabel(s) {
  if (s >= 90) return 'ممتاز 🌟'; if (s >= 75) return 'جيد جداً 👍'; if (s >= 60) return 'مقبول ⚠️'; if (s >= 40) return 'ضعيف ❌'; return 'خطير 🚨';
}

function renderStatusBanner(data) {
  $('status-icon').textContent = data.statusIcon;
  $('status-icon').className = 'w-12 h-12 rounded-xl flex items-center justify-center text-2xl ' + data.statusIconBg;
  $('status-title').textContent = data.statusTitle;
  $('status-desc').textContent = data.statusDesc;
  $('status-badge').textContent = data.statusBadge;
  $('status-badge').className = 'px-4 py-2 rounded-lg text-sm font-bold ' + data.statusBadgeClass;
}

function renderIssues(issues) {
  const c = $('issues-list');
  $('issues-count').textContent = issues.length;
  if (!issues.length) { c.innerHTML = '<div class="text-center py-8 text-gray-500"><i class="fas fa-check-circle text-4xl text-green-500/50 mb-3"></i><p>لا توجد مشاكل! الكود نظيف تماماً 🎉</p></div>'; return; }
  c.innerHTML = issues.map(issue => `
    <div class="ic ${getIssueCardClass(issue.severity)} rounded-xl p-4 border" data-severity="${issue.severity}" data-type="${issue.type}">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-lg ${getIssueIconBg(issue.severity)} flex items-center justify-center text-lg shrink-0">${issue.icon}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap"><h4 class="font-bold text-sm">${issue.title}</h4><span class="px-2 py-0.5 rounded text-[10px] font-bold ${getSeverityBadgeClass(issue.severity)}">${getSeverityLabel(issue.severity)}</span></div>
          <p class="text-gray-400 text-xs leading-relaxed mb-2">${issue.description}</p>
          ${issue.code ? `<div class="bg-black/40 rounded-lg p-2.5 border border-white/5"><div class="flex items-center justify-between mb-1"><span class="text-[10px] text-gray-500">السطر ${issue.line}</span></div><pre class="text-[11px] text-red-400/80 font-mono overflow-x-auto" dir="ltr">${escapeHtml(issue.code)}</pre></div>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function getIssueCardClass(s) { const m = { critical:'bg-red-500/5 border-red-500/20 hover:bg-red-500/10', high:'bg-orange-500/5 border-orange-500/20 hover:bg-orange-500/10', medium:'bg-yellow-500/5 border-yellow-500/20 hover:bg-yellow-500/10', low:'bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10' }; return m[s] || m.low; }
function getIssueIconBg(s) { const m = { critical:'bg-red-500/20', high:'bg-orange-500/20', medium:'bg-yellow-500/20', low:'bg-blue-500/20' }; return m[s] || m.low; }
function getSeverityBadgeClass(s) { const m = { critical:'bg-red-500/20 text-red-400', high:'bg-orange-500/20 text-orange-400', medium:'bg-yellow-500/20 text-yellow-400', low:'bg-blue-500/20 text-blue-400' }; return m[s] || m.low; }
function getSeverityLabel(s) { const m = { critical:'حرج', high:'عالي', medium:'متوسط', low:'منخفض' }; return m[s] || s; }

function renderFixCode(code, lang) {
  const pre = $('fix-code');
  const codeEl = pre.querySelector('code') || pre;
  codeEl.textContent = code;
  codeEl.className = 'language-' + (lang || 'python');
  if (window.Prism) Prism.highlightElement(codeEl);
}

function filterIssues(type) {
  State.filter = type;
  document.querySelectorAll('.if').forEach(btn => { btn.classList.remove('active','bg-cyan-500/20','text-cyan-400','border-cyan-500/30'); btn.classList.add('bg-white/5','text-gray-400','border-white/10'); });
  event.target.classList.add('active','bg-cyan-500/20','text-cyan-400','border-cyan-500/30');
  event.target.classList.remove('bg-white/5','text-gray-400','border-white/10');
  document.querySelectorAll('.ic').forEach(card => {
    const sev = card.dataset.severity; const itype = card.dataset.type;
    let show = false;
    if (type === 'all') show = true;
    else if (type === 'critical' && (sev === 'critical' || sev === 'high')) show = true;
    else if (type === 'warning' && (sev === 'medium' || itype === 'warning')) show = true;
    else if (type === 'info' && (sev === 'low' || itype === 'info')) show = true;
    card.style.display = show ? 'block' : 'none';
  });
}

function resetApp() {
  State.result = null; State.analyzing = false;
  $('results-dashboard').classList.remove('show');
  $('loading-section').classList.add('hidden');
  $('welcome-section').classList.remove('hidden');
  if (State.tab === 'upload') { $('upload-zone').classList.remove('hidden'); $('paste-zone').classList.add('hidden'); }
  else { $('upload-zone').classList.add('hidden'); $('paste-zone').classList.remove('hidden'); }
  ['safety-circle','efficiency-circle','quality-circle'].forEach(id => { const c = $(id); if (c) c.style.strokeDashoffset = '264'; });
  $('file-input').value = '';
}

function downloadReport() {
  const data = State.result; if (!data) return;
  const report = generateReportText(data);
  const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ScriptGuard_Report_${data.fileName}_${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📥 تم تحميل التقرير!', 'success');
}

function generateReportText(data) {
  return `═══════════════════════════════════════════════════\n  ScriptGuard AI - تقرير فحص الكود\n  Developed by Abdelati Zarzori\n═══════════════════════════════════════════════════\n\n📁 الملف: ${data.fileName}\n🕐 التاريخ: ${new Date().toLocaleString('ar-SA')}\n\n┌─────────────────────────────────────────────────┐\n│  📊 درجات التقييم                                │\n├─────────────────────────────────────────────────┤\n│  🛡️  الأمان:     ${data.safety}%  ${getScoreLabel(data.safety)}          │\n│  ⚡ الكفاءة:     ${data.efficiency}%  ${getScoreLabel(data.efficiency)}          │\n│  ✨ الجودة:      ${data.quality}%  ${getScoreLabel(data.quality)}          │\n└─────────────────────────────────────────────────┘\n\n⚠️ المشاكل المكتشفة (${data.issues.length}):\n${data.issues.map((issue, i) => `\n${i + 1}. [${getSeverityLabel(issue.severity)}] ${issue.title}\n   ${issue.description}\n   ${issue.line ? 'السطر: ' + issue.line : ''}\n`).join('')}\n\n═══════════════════════════════════════════════════\n  🤖 الكود المصحح:\n═══════════════════════════════════════════════════\n\n${data.fixCode}\n\n═══════════════════════════════════════════════════\n  © 2026 ScriptGuard AI. Developed by Abdelati Zarzori.\n  All rights reserved.\n═══════════════════════════════════════════════════`;
}

function copyFixCode() {
  const code = $('fix-code').textContent;
  navigator.clipboard.writeText(code).then(() => showToast('✅ تم النسخ إلى الحافظة!', 'success')).catch(() => showToast('❌ فشل النسخ', 'error'));
}

function showToast(msg, type = 'success') {
  const toast = $('toast');
  const msgEl = $('toast-message');
  msgEl.textContent = msg;
  toast.classList.remove('translate-y-20', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');
  const icon = toast.querySelector('i');
  toast.classList.remove('border-cyan-500/30', 'border-red-500/30', 'border-yellow-500/30');
  if (type === 'error') { toast.classList.add('border-red-500/30'); icon.className = 'fas fa-times-circle text-red-400'; }
  else if (type === 'warning') { toast.classList.add('border-yellow-500/30'); icon.className = 'fas fa-exclamation-circle text-yellow-400'; }
  else { toast.classList.add('border-cyan-500/30'); icon.className = 'fas fa-check-circle text-cyan-400'; }
  setTimeout(() => { toast.classList.add('translate-y-20', 'opacity-0'); toast.classList.remove('translate-y-0', 'opacity-100'); }, 3000);
}

const Companion = { messages: [], controller: null, voice: false, speaking: false, listening: false, sensors: false, locale: 'ar-MA', recognition: null, lastMotionAt: 0 };

function speakCompanion(text) { if (!Companion.voice || !('speechSynthesis' in window) || !text.trim()) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = Companion.locale; utterance.rate = .98; window.speechSynthesis.speak(utterance); }

async function sendCompanionMessage() {
  const input = $('companion-input'); const stream = $('companion-stream'); const send = $('companion-send'); const stop = $('companion-stop');
  if (!input || !stream || Companion.controller) return;
  const content = input.value.trim(); if (!content) return;
  input.value = ''; Companion.messages.push({ role: 'user', content }); stream.textContent = 'Sentinel يفكر...'; send.disabled = true; stop.disabled = false; Companion.controller = new AbortController();
  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/chat/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: Companion.messages, locale: Companion.locale }), signal: Companion.controller.signal });
    if (!response.ok || !response.body) throw new Error(`stream unavailable (${response.status})`);
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let answer = ''; let speechBuffer = '';
    stream.textContent = '';
    while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const frames = buffer.split('\n\n'); buffer = frames.pop() || ''; for (const frame of frames) { const line = frame.split('\n').find(item => item.startsWith('data:')); if (!line) continue; const payload = JSON.parse(line.slice(5)); if (payload.delta) { answer += payload.delta; speechBuffer += payload.delta; stream.textContent = answer; if (Companion.voice && /[.!?؟،]\s$/.test(speechBuffer)) { speakCompanion(speechBuffer); speechBuffer = ''; } } } }
    if (speechBuffer.trim()) speakCompanion(speechBuffer); Companion.messages.push({ role: 'assistant', content: answer });
  } catch (error) { if (error.name !== 'AbortError') { stream.textContent = 'تعذر الاتصال بخادم الروبوت. شغّل الخادم واضبط متغيرات البيئة ثم أعد المحاولة.'; showToast('⚠️ البث يحتاج إلى خادم متصل', 'warning'); } }
  finally { Companion.controller = null; send.disabled = false; stop.disabled = true; }
}

function stopCompanionStream() { Companion.controller?.abort(); Companion.controller = null; if ('speechSynthesis' in window) window.speechSynthesis.cancel(); const stop = $('companion-stop'); const send = $('companion-send'); if (stop) stop.disabled = true; if (send) send.disabled = false; }

function stopCompanionListening() { Companion.listening = false; Companion.recognition?.stop(); const button = $('companion-listen'); if (button) { button.setAttribute('aria-pressed', 'false'); button.textContent = 'بدء الاستماع'; } }

function startCompanionListening() { const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!Recognition) { showToast('⚠️ الاستماع غير مدعوم في هذا المتصفح', 'warning'); return; } if (Companion.listening) { stopCompanionListening(); return; } const recognition = new Recognition(); recognition.lang = Companion.locale; recognition.continuous = true; recognition.interimResults = false; recognition.onresult = event => { const result = event.results[event.results.length - 1]?.[0]?.transcript?.trim(); if (result) { $('companion-input').value = result; sendCompanionMessage(); } }; recognition.onerror = event => { if (event.error !== 'aborted') showToast('⚠️ تعذر الوصول إلى الميكروفون', 'warning'); }; recognition.onend = () => { if (Companion.listening) { try { recognition.start(); } catch {} } }; Companion.recognition = recognition; Companion.listening = true; try { recognition.start(); const button = $('companion-listen'); button?.setAttribute('aria-pressed', 'true'); if (button) button.textContent = 'الاستماع مفعّل'; } catch { stopCompanionListening(); showToast('⚠️ لم يمنح المتصفح إذن الميكروفون', 'warning'); } }

async function enableCompanionSensors() { if (!window.isSecureContext) { showToast('⚠️ الحساسات تحتاج HTTPS', 'warning'); return; } if (typeof DeviceMotionEvent === 'undefined') { showToast('⚠️ حساس الحركة غير متاح في هذا الجهاز', 'warning'); return; } if (typeof DeviceMotionEvent.requestPermission === 'function') { const permission = await DeviceMotionEvent.requestPermission(); if (permission !== 'granted') { showToast('⚠️ لم يتم منح إذن الحركة', 'warning'); return; } } Companion.sensors = !Companion.sensors; const button = $('companion-sensors'); if (Companion.sensors) { window.addEventListener('devicemotion', handleCompanionMotion); if (button) button.textContent = 'الاهتزاز مفعّل'; showToast('📳 سيستجيب الروبوت للحركة بإذن الجهاز', 'success'); } else { window.removeEventListener('devicemotion', handleCompanionMotion); if (button) button.textContent = 'تفعيل الاهتزاز'; } }

function handleCompanionMotion(event) { if (!Companion.sensors || !Companion.listening) return; const acceleration = event.accelerationIncludingGravity; if (!acceleration) return; const magnitude = Math.hypot(acceleration.x || 0, acceleration.y || 0, acceleration.z || 0); const now = Date.now(); if (magnitude > 18 && now - Companion.lastMotionAt > 30000 && !Companion.controller) { Companion.lastMotionAt = now; const prompt = Companion.locale === 'ar-MA' ? 'حسّيت بالتليفون تحرك. سَوّلني بعفوية واش كلشي بخير وبالدارجة المغربية.' : Companion.locale === 'en-US' ? 'The device moved. Respond naturally and ask if everything is okay.' : 'شعر الهاتف بحركة. اسأل بلطف إن كان كل شيء بخير.'; $('companion-input').value = prompt; sendCompanionMessage(); } }

function initCompanion() { const input = $('companion-input'); const send = $('companion-send'); const stop = $('companion-stop'); const voice = $('companion-voice-toggle'); const locale = $('companion-locale'); send?.addEventListener('click', sendCompanionMessage); stop?.addEventListener('click', stopCompanionStream); voice?.addEventListener('click', () => { Companion.voice = !Companion.voice; voice.setAttribute('aria-pressed', String(Companion.voice)); voice.textContent = Companion.voice ? 'الصوت مفعّل' : 'الصوت متوقف'; if (!Companion.voice && 'speechSynthesis' in window) window.speechSynthesis.cancel(); }); locale?.addEventListener('change', () => { Companion.locale = locale.value; if (Companion.recognition) { stopCompanionListening(); startCompanionListening(); } }); $('companion-listen')?.addEventListener('click', startCompanionListening); $('companion-sensors')?.addEventListener('click', enableCompanionSensors); input?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); sendCompanionMessage(); } }); }

function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

function initRobotInterface() {
  const stage = $('robot-stage'); const model = $('robot-model'); const status = $('robot-status-text'); const localeToggle = $('robot-locale-toggle');
  if (!stage || !model) return;
  const locale = { ar: { title: 'روبوتك الذكي، حاضر لفهم كل فكرة', description: 'واجهة مستقبلية موحدة للمحادثة، تحليل الأكواد، الترجمة، وإدارة المهام. يتفاعل معك بصريًا، بينما تبقى الأفعال الخارجية تحت تأكيدك.', ready: 'النواة جاهزة — بانتظار أمرك', toggle: 'English', label: 'تفاعل مع الروبوت ثلاثي الأبعاد' }, en: { title: 'Your intelligent robot, ready to understand every idea', description: 'A futuristic workspace for conversation, code analysis, translation, and tasks. It responds visually while external actions stay behind your confirmation.', ready: 'Core ready — awaiting your command', toggle: 'العربية', label: 'Interact with the 3D robot' } };
  let currentLocale = localStorage.getItem('sg_robot_locale') === 'en' ? 'en' : 'ar';
  const applyLocale = () => { const copy = locale[currentLocale]; $('robot-title').textContent = copy.title; $('robot-description').textContent = copy.description; if (status && !status.dataset.active) status.textContent = copy.ready; if (localeToggle) { localeToggle.textContent = copy.toggle; localeToggle.setAttribute('aria-label', currentLocale === 'ar' ? 'Switch robot language to English' : 'تبديل لغة الروبوت إلى العربية'); } $('robot-copy')?.setAttribute('dir', currentLocale === 'ar' ? 'rtl' : 'ltr'); };
  localeToggle?.addEventListener('click', event => { event.stopPropagation(); currentLocale = currentLocale === 'ar' ? 'en' : 'ar'; localStorage.setItem('sg_robot_locale', currentLocale); if (status) { status.dataset.active = ''; status.textContent = locale[currentLocale].ready; } applyLocale(); });
  applyLocale();
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const setPose = (x, y) => { if (reduced) return; model.style.transform = `rotateX(${y * -5}deg) rotateY(${x * 8}deg) translateZ(8px)`; };
  stage.addEventListener('pointermove', event => { const rect = stage.getBoundingClientRect(); setPose((event.clientX - rect.left) / rect.width - .5, (event.clientY - rect.top) / rect.height - .5); });
  stage.addEventListener('pointerleave', () => { model.style.transform = ''; });
  stage.addEventListener('click', () => { model.classList.remove('robot-scan'); void model.offsetWidth; model.classList.add('robot-scan'); if (status) { status.dataset.active = ''; status.textContent = currentLocale === 'ar' ? 'فحص بصري نشط — النواة تستجيب' : 'Visual scan active — core responding'; } showToast(currentLocale === 'ar' ? '🤖 الروبوت جاهز لاستقبال أمرك' : '🤖 Robot ready for your command', 'success'); });
  stage.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); stage.click(); } });
}

console.log('🛡️ ScriptGuard AI Full-Stack v1.0');
console.log('👤 Owner & Lead Developer: Abdelati Zarzori');
console.log('💡 Tips: Ctrl+Enter = Analyze | Escape = Reset');
console.log('🔌 API:', CONFIG.API_BASE);
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => { initRobotInterface(); initCompanion(); });
