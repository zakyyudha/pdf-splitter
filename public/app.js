const form = document.getElementById('split-form');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');

let lastObjectUrl = null;

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = 'status' + (type ? ' ' + type : '');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const fileInput = document.getElementById('pdf');
  const file = fileInput.files[0];
  if (!file) {
    setStatus('Please choose a PDF file first.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('pdf', file);

  const pagesValue = document.getElementById('pages').value.trim();
  if (pagesValue !== '') {
    formData.append('pages', pagesValue);
  }

  submitBtn.disabled = true;
  resultEl.classList.add('hidden');
  setStatus('Splitting your PDF...', 'working');

  try {
    const response = await fetch('/api/split', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let message = 'Something went wrong.';
      try {
        const data = await response.json();
        if (data.error) message = data.error;
      } catch (_) {
        /* response was not JSON */
      }
      throw new Error(message);
    }

    const pageCount = response.headers.get('X-Page-Count');
    const blob = await response.blob();

    if (lastObjectUrl) {
      URL.revokeObjectURL(lastObjectUrl);
    }
    lastObjectUrl = URL.createObjectURL(blob);

    const baseName = file.name.replace(/\.pdf$/i, '');
    const downloadName = baseName + '-split.pdf';

    setStatus('Done!', '');
    resultEl.innerHTML = '';

    const summary = document.createElement('div');
    summary.textContent = pageCount
      ? 'Created ' + pageCount + ' page(s).'
      : 'Your split PDF is ready.';
    resultEl.appendChild(summary);

    const link = document.createElement('a');
    link.href = lastObjectUrl;
    link.download = downloadName;
    link.textContent = 'Download ' + downloadName;
    resultEl.appendChild(link);

    resultEl.classList.remove('hidden');
  } catch (err) {
    setStatus(err.message || 'Failed to split the PDF.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
});
