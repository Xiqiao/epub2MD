const RAW_DIR = 'raw_book';
const BOOK_DIR = 'output_book';
let rootLabel = 'root_folder';

const state = {
  rawFiles: [],
  books: [],
  mdFiles: [],
  queue: [],
  selectedBook: null,
  selectedMd: null,
};

const $ = (id) => document.getElementById(id);

const rawList = $('raw-list');
const bookList = $('book-list');
const mdList = $('md-list');
const queueList = $('queue');
const logEl = $('log');
const previewEl = $('preview');
const previewTitle = $('preview-title');
const progressBar = $('progress-bar');
const rawPath = $('raw-path');
const bookPath = $('book-path');
const bookFilesTitle = $('book-files-title');

function log(message) {
  const stamp = new Date().toISOString().slice(11, 19);
  logEl.textContent += `[${stamp}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function clearLog() {
  logEl.textContent = '';
}

function updateProgress() {
  if (!state.queue.length) {
    progressBar.style.width = '0%';
    return;
  }
  const done = state.queue.filter((item) => item.done).length;
  progressBar.style.width = `${Math.round((done / state.queue.length) * 100)}%`;
}

function renderList(el, items, onClick) {
  el.innerHTML = '';
  if (el === mdList) {
    const li = document.createElement('li');
    li.className = 'list-select-all';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = items.length > 0 && items.every((item) => item.selected);
    checkbox.addEventListener('change', () => {
      const checked = checkbox.checked;
      items.forEach((item) => {
        item.selected = checked;
      });
      renderList(mdList, items, onClick);
      updateSelectedMdSummary();
    });

    const title = document.createElement('div');
    title.textContent = 'Select all';

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = buildSelectedSummary(items);

    li.appendChild(checkbox);
    li.appendChild(title);
    li.appendChild(meta);
    el.appendChild(li);
  }

  items.forEach((item) => {
    const li = document.createElement('li');
    li.title = item.name;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!item.selected;
    checkbox.addEventListener('change', () => {
      item.selected = checkbox.checked;
      if (el === mdList) {
        updateSelectedMdSummary();
      }
    });

    const title = document.createElement('div');
    title.textContent = item.name;
    title.title = item.name;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = item.meta || '';

    li.appendChild(checkbox);
    li.appendChild(title);
    li.appendChild(meta);

    li.addEventListener('click', (event) => {
      if (event.target.tagName.toLowerCase() === 'input') return;
      onClick?.(item);
    });
    el.appendChild(li);
  });
}

function renderQueue() {
  queueList.innerHTML = '';
  state.queue.forEach((job) => {
    const li = document.createElement('li');
    li.textContent = job.label;
    const badge = document.createElement('span');
    badge.textContent = job.done ? 'done' : 'pending';
    li.appendChild(badge);
    queueList.appendChild(li);
  });
  updateProgress();
}

async function loadConfig() {
  try {
    const response = await fetch('/api/epub2md/config');
    if (response.ok) {
      const data = await response.json();
      rootLabel = data.root_label || rootLabel;
    }
  } catch (error) {
    log(`Config load failed: ${error?.message || error}`);
  }
  rawPath.textContent = `${rootLabel}\\${RAW_DIR}`;
  bookPath.textContent = `${rootLabel}\\${BOOK_DIR}`;
}

async function pickRoot() {
  await loadConfig();
  await refreshAll();
  log(`Using server root: ${rootLabel}`);
}

async function refreshRawList() {
  try {
    const response = await fetch('/api/epub2md/raw');
    if (!response.ok) {
      log(`Raw list failed: ${response.status}`);
      return;
    }
    const data = await response.json();
    state.rawFiles = (data.files || []).map((file) => ({
      name: file.name,
      selected: false,
      meta: 'epub',
    }));
    renderList(rawList, state.rawFiles);
    log(`Loaded ${state.rawFiles.length} raw epub files.`);
  } catch (error) {
    log(`Raw list error: ${error?.message || error}`);
  }
}

async function refreshBookList() {
  try {
    const response = await fetch('/api/epub2md/books');
    if (!response.ok) {
      log(`Book list failed: ${response.status}`);
      return;
    }
    const data = await response.json();
    state.books = (data.books || []).map((dir) => ({
      name: dir.name,
      selected: false,
      meta: 'folder',
    }));
    renderList(bookList, state.books, selectBook);
    log(`Loaded ${state.books.length} book folders.`);
  } catch (error) {
    log(`Book list error: ${error?.message || error}`);
  }
}

async function refreshAll() {
  await refreshRawList();
  await refreshBookList();
  state.mdFiles = [];
  renderList(mdList, []);
  previewTitle.textContent = 'No file selected';
  previewEl.textContent = '';
}

function selectAll(list) {
  list.forEach((item) => {
    item.selected = true;
  });
}

async function selectBook(book) {
  state.selectedBook = book;
  try {
    const response = await fetch(`/api/epub2md/md?book=${encodeURIComponent(book.name)}`);
    if (!response.ok) {
      log(`MD list failed: ${response.status}`);
      return;
    }
    const data = await response.json();
    const mdFiles = (data.files || []).map((file) => ({
      name: file.name,
      selected: false,
      meta: `${file.count || 0} chars`,
      count: file.count || 0,
    }));
    state.mdFiles = mdFiles.sort((a, b) => a.name.localeCompare(b.name));
    renderList(mdList, state.mdFiles, previewMd);
    updateSelectedMdSummary();
    log(`Opened book: ${book.name}`);
  } catch (error) {
    log(`MD list error: ${error?.message || error}`);
  }
}

async function previewMd(md) {
  state.selectedMd = md;
  previewTitle.textContent = md.name;
  if (!state.selectedBook) return;
  try {
    const url = `/api/epub2md/read?book=${encodeURIComponent(
      state.selectedBook.name,
    )}&path=${encodeURIComponent(md.name)}`;
    const response = await fetch(url);
    if (!response.ok) {
      log(`Preview failed: ${response.status}`);
      return;
    }
    previewEl.textContent = await response.text();
  } catch (error) {
    log(`Preview error: ${error?.message || error}`);
  }
}

function updateSelectedMdCount() {
  bookFilesTitle.textContent = 'Book files';
}

function buildSelectedSummary(items) {
  const selected = items.filter((item) => item.selected);
  const total = selected.reduce((sum, item) => sum + (item.count || 0), 0);
  return `(${selected.length} selected, ${total} chars)`;
}

function updateSelectedMdSummary() {
  updateSelectedMdCount();
  const selectAllMeta = mdList.querySelector('.list-select-all .meta');
  if (selectAllMeta) {
    selectAllMeta.textContent = buildSelectedSummary(state.mdFiles);
  }
}

function enqueue(label) {
  const job = { label, done: false };
  state.queue.push(job);
  renderQueue();
  return job;
}

function simulateQueue() {
  state.queue.forEach((job, index) => {
    setTimeout(() => {
      job.done = true;
      renderQueue();
    }, 600 * (index + 1));
  });
}

async function uploadFiles(files) {
  if (!files.length) return;
  const form = new FormData();
  files.forEach((file) => {
    form.append('files', file, file.name);
  });
  try {
    const response = await fetch('/api/epub2md/upload', {
      method: 'POST',
      body: form,
    });
    if (!response.ok) {
      log(`Upload failed: ${response.status}`);
      return;
    }
    const data = await response.json();
    log(`Added ${data.files?.length || 0} file(s) to ${RAW_DIR}.`);
    await refreshRawList();
  } catch (error) {
    log(`Upload error: ${error?.message || error}`);
  }
}

async function deleteBook() {
  if (!state.selectedBook) {
    log('Select a book folder first.');
    return;
  }
  try {
    const response = await fetch('/api/epub2md/delete-book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book: state.selectedBook.name }),
    });
    if (!response.ok) {
      log(`Delete book failed: ${response.status}`);
      return;
    }
    log(`Deleted book folder: ${state.selectedBook.name}`);
    await refreshBookList();
  } catch (error) {
    log(`Delete book error: ${error?.message || error}`);
  }
}

async function deleteMd() {
  if (!state.selectedBook || !state.selectedMd) {
    log('Select a book and md file first.');
    return;
  }
  try {
    const response = await fetch('/api/epub2md/delete-md', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        book: state.selectedBook.name,
        path: state.selectedMd.name,
      }),
    });
    if (!response.ok) {
      log(`Delete md failed: ${response.status}`);
      return;
    }
    log(`Deleted md: ${state.selectedMd.name}`);
    await selectBook(state.selectedBook);
    previewTitle.textContent = 'No file selected';
    previewEl.textContent = '';
  } catch (error) {
    log(`Delete md error: ${error?.message || error}`);
  }
}

async function deleteSelectedMd() {
  if (!state.selectedBook) {
    log('Select a book folder first.');
    return;
  }
  const selected = state.mdFiles.filter((item) => item.selected);
  if (!selected.length) {
    log('No md files selected.');
    return;
  }
  try {
    const response = await fetch('/api/epub2md/delete-md', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        book: state.selectedBook.name,
        paths: selected.map((item) => item.name),
      }),
    });
    if (!response.ok) {
      log(`Delete selected failed: ${response.status}`);
      return;
    }
    log(`Deleted ${selected.length} md files.`);
    await selectBook(state.selectedBook);
  } catch (error) {
    log(`Delete selected error: ${error?.message || error}`);
  }
}

async function renameSelectedMd() {
  if (!state.selectedBook) {
    log('Select a book folder first.');
    return;
  }
  const selected = state.mdFiles.filter((item) => item.selected);
  if (selected.length !== 1) {
    log('Select exactly one md file to rename.');
    return;
  }
  const target = selected[0];
  const newName = window.prompt('New file name:', target.name.split('/').pop());
  if (!newName) return;
  if (!newName.endsWith('.md')) {
    log('File name must end with .md');
    return;
  }
  try {
    const response = await fetch('/api/epub2md/rename-md', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        book: state.selectedBook.name,
        path: target.name,
        new_name: newName,
      }),
    });
    if (!response.ok) {
      log(`Rename failed: ${response.status}`);
      return;
    }
    log(`Renamed to ${newName}`);
    await selectBook(state.selectedBook);
  } catch (error) {
    log(`Rename error: ${error?.message || error}`);
  }
}

async function mergeSelectedMd(selectedItems, job) {
  if (!state.selectedBook) {
    log('Select a book folder first.');
    return;
  }
  const sorted = [...selectedItems].sort((a, b) => a.name.localeCompare(b.name));
  try {
    const response = await fetch('/api/epub2md/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        book: state.selectedBook.name,
        paths: sorted.map((item) => item.name),
      }),
    });
    if (!response.ok) {
      log(`Merge failed: ${response.status}`);
      return;
    }
    const data = await response.json();
    log(`Merged to merged/${data.name}`);
    if (job) {
      job.done = true;
      renderQueue();
    }
    await selectBook(state.selectedBook);
  } catch (error) {
    log(`Merge error: ${error?.message || error}`);
  }
}

function bindEvents() {
  $('pick-root').addEventListener('click', pickRoot);
  $('refresh').addEventListener('click', refreshAll);
  $('refresh-books').addEventListener('click', refreshBookList);
  $('select-all-raw').addEventListener('click', () => {
    selectAll(state.rawFiles);
    renderList(rawList, state.rawFiles);
  });
  $('clear-log').addEventListener('click', clearLog);
  $('clear-queue').addEventListener('click', () => {
    state.queue = [];
    renderQueue();
  });
  $('convert-selected').addEventListener('click', async () => {
    const selected = state.rawFiles.filter((file) => file.selected);
    if (!selected.length) {
      log('No raw epub selected.');
      return;
    }

    const jobs = selected.map((file) => ({
      file,
      job: enqueue(`Convert ${file.name}`),
    }));

    try {
      const response = await fetch('/api/epub2md/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: selected.map((file) => file.name) }),
      });

      if (!response.ok) {
        const text = await response.text();
        jobs.forEach(({ job }) => {
          job.done = true;
        });
        renderQueue();
        log(`Conversion failed: ${response.status} ${text}`);
        return;
      }

      const data = await response.json();
      const results = data.results || [];
      results.forEach((result) => {
        const match = jobs.find(({ file }) => file.name === result.name);
        if (match) {
          match.job.done = true;
        }
        if (result.ok) {
          log(`Converted ${result.name}`);
        } else {
          log(`Failed ${result.name}: ${result.error || result.stderr || 'unknown error'}`);
        }
      });
      renderQueue();
      await refreshRawList();
      await refreshBookList();
    } catch (error) {
      jobs.forEach(({ job }) => {
        job.done = true;
      });
      renderQueue();
      log(`Conversion error: ${error?.message || error}`);
    }
  });
  $('merge-md').addEventListener('click', () => {
    const selected = state.mdFiles.filter((file) => file.selected);
    if (!selected.length) {
      log('No md files selected.');
      return;
    }
    const job = enqueue(`Merge ${selected.length} md files`);
    mergeSelectedMd(selected, job);
  });
  $('delete-md-selected').addEventListener('click', deleteSelectedMd);
  $('rename-md').addEventListener('click', renameSelectedMd);
  $('delete-book').addEventListener('click', deleteBook);
  $('delete-md').addEventListener('click', deleteMd);

  const dropzone = $('dropzone');
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('drag');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag');
  });
  dropzone.addEventListener('drop', async (event) => {
    event.preventDefault();
    dropzone.classList.remove('drag');
    const files = Array.from(event.dataTransfer.files).filter((file) => file.name.endsWith('.epub'));
    if (!files.length) {
      log('No epub files dropped.');
      return;
    }
    await uploadFiles(files);
  });

  $('add-files').addEventListener('click', async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.epub,application/epub+zip';
    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      await uploadFiles(files);
    });
    input.click();
  });

  initDragSelect();
}

bindEvents();
loadConfig().then(refreshAll);
log(`Ready. Using server root to load ${RAW_DIR} and ${BOOK_DIR}.`);

function initDragSelect() {
  let isSelecting = false;
  let startX = 0;
  let startY = 0;
  let rectEl = null;

  const onMouseMove = (event) => {
    if (!isSelecting || !rectEl) return;
    const currentX = event.clientX;
    const currentY = event.clientY;
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(startX - currentX);
    const height = Math.abs(startY - currentY);
    rectEl.style.left = `${left}px`;
    rectEl.style.top = `${top}px`;
    rectEl.style.width = `${width}px`;
    rectEl.style.height = `${height}px`;
  };

  const onMouseUp = () => {
    if (!isSelecting || !rectEl) return;
    const rect = rectEl.getBoundingClientRect();
    rectEl.remove();
    rectEl = null;
    isSelecting = false;

    const rows = Array.from(mdList.querySelectorAll('li:not(.list-select-all)'));
    let matched = 0;
    rows.forEach((row, index) => {
      const rowRect = row.getBoundingClientRect();
      const intersects = !(
        rect.right < rowRect.left ||
        rect.left > rowRect.right ||
        rect.bottom < rowRect.top ||
        rect.top > rowRect.bottom
      );
      if (intersects) {
        state.mdFiles[index].selected = true;
        matched += 1;
      } else {
        state.mdFiles[index].selected = false;
      }
    });

    if (matched > 0) {
      renderList(mdList, state.mdFiles, previewMd);
      updateSelectedMdSummary();
    }
  };

  mdList.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if (event.target.tagName.toLowerCase() === 'input') return;
    if (event.target.closest('.list-select-all')) return;
    isSelecting = true;
    startX = event.clientX;
    startY = event.clientY;
    rectEl = document.createElement('div');
    rectEl.className = 'selection-rect';
    document.body.appendChild(rectEl);
  });

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}
