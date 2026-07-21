const form = document.getElementById('split-form');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const progressEl = document.getElementById('progress');

let lastObjectUrl = null;
const defaultBtnText = submitBtn.textContent;

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = 'status' + (type ? ' ' + type : '');
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? 'Splitting...' : defaultBtnText;
  progressEl.classList.toggle('hidden', !isLoading);
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

  setLoading(true);
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

    // Trigger the download automatically.
    const link = document.createElement('a');
    link.href = lastObjectUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Build the confirmation block.
    setStatus('', '');
    resultEl.innerHTML = '';

    const chip = document.createElement('span');
    chip.className = 'chip chip-success';
    chip.textContent = 'Downloaded';
    resultEl.appendChild(chip);

    const fileName = document.createElement('p');
    fileName.className = 'result-file';
    fileName.textContent = downloadName;
    resultEl.appendChild(fileName);

    const detail = document.createElement('div');
    detail.className = 'result-detail';
    detail.textContent = pageCount
      ? 'Created ' + pageCount + ' page(s). Check your downloads folder.'
      : 'Check your downloads folder.';
    resultEl.appendChild(detail);

    // Fallback link in case the browser blocked the automatic download.
    const again = document.createElement('a');
    again.href = lastObjectUrl;
    again.download = downloadName;
    again.textContent = 'Download again';
    resultEl.appendChild(again);

    resultEl.classList.remove('hidden');

    // Reset the uploader so the user can start fresh.
    form.reset();
  } catch (err) {
    setStatus(err.message || 'Failed to split the PDF.', 'error');
  } finally {
    setLoading(false);
  }
});
