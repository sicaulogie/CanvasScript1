// ==UserScript==
// @name         Canvas Floating Panel (Modules, Assignments, Grades Quick Setup)
// @namespace    https://prismlearning.instructure.com/
// @version      3.2
// @description  Floating hideable panel on every page; Modules tools, Assignment setup, Gradebook bulk grading
// @match        https://prismlearning.instructure.com/courses/*
// @updateURL    https://raw.githubusercontent.com/sicaulogie/CanvasScript1/main/CanvasPanel.js
// @downloadURL  https://raw.githubusercontent.com/sicaulogie/CanvasScript1/main/CanvasPanel.js
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  'use strict';

  const path = window.location.pathname;
  const isModulesPage = /^\/courses\/\d+\/modules/.test(path);
  const isAssignmentEditPage = /^\/courses\/\d+\/assignments\/\d+\/edit/.test(path);
  const isGradesPage = /^\/courses\/\d+\/gradebook/.test(path);

  const panel = createFloatingPanel();

  if (isModulesPage) {
    renderModulesContent(panel);
  } else if (isAssignmentEditPage) {
    renderAssignmentContent(panel);
  } else if (isGradesPage) {
    renderGradesContent(panel);
  } else {
    renderDefaultContent(panel);
  }

  // ---------- FLOATING PANEL SHELL (used on every page) ----------
  function createFloatingPanel() {
    const wrap = document.createElement('div');
    wrap.id = 'tm-side-panel';
    wrap.style.cssText = `
      position: fixed;
      top: 120px;
      right: 0;
      max-width: 320px;
      transform: translateX(calc(100% - 32px));
      transition: transform 0.25s ease;
      background: #fff;
      border: 1px solid #ccc;
      border-right: none;
      border-radius: 8px 0 0 8px;
      box-shadow: -2px 2px 10px rgba(0,0,0,0.2);
      z-index: 999999;
      font-family: Lato, sans-serif;
      font-size: 13px;
      display: flex;
      align-items: stretch;
    `;

    wrap.innerHTML = `
      <div id="tm-panel-tab" style="
        writing-mode: vertical-rl;
        text-orientation: mixed;
        background: #0374B5;
        color: #fff;
        padding: 10px 6px;
        cursor: pointer;
        border-radius: 8px 0 0 8px;
        user-select: none;
        white-space: nowrap;
        flex-shrink: 0;
      ">Quick Panel</div>
      <div id="tm-panel-body" style="padding:12px; flex:1; overflow:auto; max-height:80vh;"></div>
    `;
    document.body.appendChild(wrap);

    const tab = wrap.querySelector('#tm-panel-tab');
    let open = false;
    function setOpen(state) {
      open = state;
      wrap.style.transform = open ? 'translateX(0)' : 'translateX(calc(100% - 32px))';
    }
    tab.addEventListener('click', () => setOpen(!open));
    document.addEventListener('click', (e) => {
      if (open && !wrap.contains(e.target)) setOpen(false);
    });

    return wrap.querySelector('#tm-panel-body');
  }

  function renderDefaultContent(body) {
    body.innerHTML = `<p style="margin:0;color:#555;">No tools for this page.</p>`;
  }

  // ---------- GRADEBOOK PAGE CONTENT ----------
  function renderGradesContent(body) {
    const savedAssignName = GM_getValue('savedAssignName', '');
    const savedAssignGrade = GM_getValue('savedAssignGrade', '');
    const savedNeedsGrading = GM_getValue('savedNeedsGrading', false);

    body.innerHTML = `
      <div style="font-weight:bold;margin-bottom:12px;font-size:14px;">Gradebook Quick Setup</div>
      <p style="margin:0 0 6px 0;color:#555;">Apply a specific grade to all <b>visible</b> students for a specific assignment.</p>
      <p style="margin:0 0 10px 0;color:#c00;font-size:11px;line-height:1.2;">
        Note: Canvas hides off-screen rows. Scroll to the bottom to load all students before applying!
      </p>

      <label style="display:block; margin-bottom:6px;">
        <span style="display:block; margin-bottom:2px; font-weight:bold;">Assignment Name (partial match):</span>
        <input type="text" id="tm-assign-name" value="${savedAssignName}" placeholder="e.g. U0 Read" style="width:100%; box-sizing:border-box; padding:6px; border:1px solid #ccc; border-radius:4px;">
      </label>

      <label style="display:block; margin-bottom:10px;">
        <span style="display:block; margin-bottom:2px; font-weight:bold;">Grade Value:</span>
        <input type="text" id="tm-assign-grade" value="${savedAssignGrade}" placeholder="e.g. 100, Excused" style="width:100%; box-sizing:border-box; padding:6px; border:1px solid #ccc; border-radius:4px;">
      </label>

      <label style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
        <input type="checkbox" id="tm-chk-needs-grading" ${savedNeedsGrading ? 'checked' : ''}>
        Only apply to "Needs Grading" (submitted, un-graded)
      </label>

      <button type="button" id="tm-apply-grades-btn" style="width:100%; padding:6px; background:#0374B5; color:#fff; border:none; border-radius:4px; cursor:pointer;">
        Apply Grades
      </button>
      <div id="tm-grades-status" style="margin-top:6px;color:#2d7d2d;font-size:12px;"></div>
    `;

    const nameInput = body.querySelector('#tm-assign-name');
    const gradeInput = body.querySelector('#tm-assign-grade');
    const needsGradingChk = body.querySelector('#tm-chk-needs-grading');

    nameInput.addEventListener('input', (e) => GM_setValue('savedAssignName', e.target.value));
    gradeInput.addEventListener('input', (e) => GM_setValue('savedAssignGrade', e.target.value));
    needsGradingChk.addEventListener('change', (e) => GM_setValue('savedNeedsGrading', e.target.checked));

    body.querySelector('#tm-apply-grades-btn').addEventListener('click', () => {
      applyBulkGrades(body);
    });
  }

  // Given a row from the scrollable grade pane, find its matching row in the
  // frozen (left) student-name pane. SlickGrid keeps both panes vertically in
  // sync by giving matching rows the same inline "top" position — even though
  // the actual DOM nodes get destroyed/recycled as you scroll, whatever node
  // currently sits at a given "top" always belongs to the same student on
  // both sides at that instant. Matching by "top" (not by array index) is
  // what makes this robust to virtualization.
  // Extract the numeric assignment ID from a matched header element. Canvas
  // puts it right in the header's class list as a token like "assignment_2289173".
  function getAssignmentIdFromHeader(headerEl) {
    const match = headerEl.className.match(/\bassignment_(\d+)\b/);
    return match ? match[1] : null;
  }

  // Extract the numeric student ID directly from a row's own class list.
  // Canvas puts it right there as a token like "student_36717" — no need to
  // cross-reference a separate frozen name column or rely on row position.
  function getStudentIdFromRow(rowEl) {
    const match = rowEl.className.match(/\bstudent_(\d+)\b/);
    return match ? match[1] : null;
  }

  async function applyBulkGrades(body) {
    const targetName = body.querySelector('#tm-assign-name').value.trim().toLowerCase();
    const targetGrade = body.querySelector('#tm-assign-grade').value.trim();
    const onlyNeedsGrading = body.querySelector('#tm-chk-needs-grading').checked;
    const statusEl = body.querySelector('#tm-grades-status');
    const runBtn = body.querySelector('#tm-apply-grades-btn');

    if (!targetName || !targetGrade) {
      statusEl.style.color = '#c00';
      statusEl.textContent = 'Please fill out both fields.';
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
      return;
    }

    runBtn.disabled = true;
    runBtn.style.opacity = '0.5';
    statusEl.style.color = '#0374B5';
    statusEl.textContent = 'Searching for column...';

    // 1. Find the target column header, and pull the assignment's numeric ID
    //    out of it. We use this ID (not column position) to find the right
    //    cell on every row, so nothing here depends on column order/index.
    const headers = document.querySelectorAll('.slick-header-column');
    let assignmentId = null;

    for (let i = 0; i < headers.length; i++) {
      const titleEl = headers[i].querySelector('.assignment-name');
      if (titleEl && titleEl.textContent.toLowerCase().includes(targetName)) {
        assignmentId = getAssignmentIdFromHeader(headers[i]);
        break;
      }
    }

    if (!assignmentId) {
      statusEl.style.color = '#c00';
      statusEl.textContent = 'Assignment not found. Check the name.';
      runBtn.disabled = false;
      runBtn.style.opacity = '1';
      return;
    }

    const cellSelector = '.assignment_' + assignmentId;
    let appliedCount = 0;
    let skippedCount = 0;
    const processedIds = new Set(); // Students we've already handled.

    statusEl.textContent = `Processing visible rows...`;

    // 2. Repeatedly scan the CURRENTLY rendered rows and process whichever
    //    visible student we haven't already handled. We identify both the
    //    row (student) and the cell (assignment) by the IDs baked into their
    //    own class names — e.g. "student_36717" and "assignment_2289173" —
    //    rather than by array index or DOM position. That makes this
    //    immune to Canvas recycling/reordering row DOM nodes as the grid
    //    scrolls (which is what caused the old index-based version to
    //    randomly skip/duplicate students).
    //    Rows belonging to the frozen name pane (if any) simply won't have
    //    a matching `.assignment_<id>` cell and are skipped automatically.
    let stagnantPasses = 0;
    while (true) {
      const rows = document.querySelectorAll('.slick-row');

      let targetRow = null;
      let targetId = null;
      let targetCell = null;
      for (const row of rows) {
        const id = getStudentIdFromRow(row);
        if (!id || processedIds.has(id)) continue;
        const cell = row.querySelector(cellSelector);
        if (!cell) continue; // Wrong pane, or this column isn't in this row.
        targetRow = row;
        targetId = id;
        targetCell = cell;
        break;
      }

      if (!targetRow) {
        // Nothing new to process among currently rendered rows. Give the
        // grid a brief moment in case a scroll/render is still settling,
        // then bail out after a couple of empty passes in a row.
        stagnantPasses++;
        if (stagnantPasses >= 2) break;
        await sleep(300);
        continue;
      }
      stagnantPasses = 0;

      if (onlyNeedsGrading) {
        const hasIcon = targetCell.querySelector('.icon-not-graded');
        const hasText = targetCell.textContent.includes('Needs Grading');
        if (!hasIcon && !hasText) {
          skippedCount++;
          processedIds.add(targetId);
          continue;
        }
      }

      // Open the input cell
      targetCell.click();
      await sleep(150); // Buffer for UI to render input

      // Re-find the exact same cell by ID (student_X + assignment_Y), not by
      // position, in case the click caused a re-render that recycled this
      // DOM node. The CSS selector below finds it precisely regardless.
      const activeCell = document.querySelector(`.student_${targetId} ${cellSelector}`) || targetCell;

      const input = activeCell.querySelector('input[type="text"]');
      if (input) {
        setReactInputValue(input, targetGrade);

        // Dispatch "Enter" key to commit the grade and trigger Canvas save
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        appliedCount++;

        await sleep(250); // Wait for Canvas save and auto-advance animation

        // Canvas auto-advances the active cell to the NEXT row in this same
        // column after Enter, and opens it in edit mode (an empty input) —
        // regardless of that student's actual status (not submitted,
        // already graded, or submitted-ungraded). We blur it to close that
        // editor, but blurring doesn't instantly repaint the cell back to
        // its normal display (with the "Needs Grading" icon/text, if any).
        // Give React a moment to finish that repaint BEFORE the next loop
        // iteration inspects this same cell for the "onlyNeedsGrading"
        // filter — otherwise we'd be reading a half-reverted, editor-mode
        // DOM and could wrongly conclude "not Needs Grading" for a student
        // who actually still needs a grade, just because Canvas happened to
        // auto-open their cell as a side effect of the previous student.
        if (document.activeElement && document.activeElement.tagName === 'INPUT') {
            document.activeElement.blur();
            await sleep(150); // Let the cell's display state settle before we judge it.
        }
      }

      // Mark this student done AFTER processing, using the ID we captured
      // up front — never re-derive it from a possibly-recycled node.
      processedIds.add(targetId);
    }

    // Final safety net: if a Canvas auto-advance left an editor open on some
    // row we never got to (e.g. the loop ended right after processing the
    // second-to-last row), close it so we don't leave the Gradebook UI in a
    // half-open editing state.
    if (document.activeElement && document.activeElement.tagName === 'INPUT') {
      document.activeElement.blur();
    }

    statusEl.style.color = '#2d7d2d';
    if (onlyNeedsGrading) {
      statusEl.textContent = `Updated ${appliedCount} students (Skipped ${skippedCount}).`;
    } else {
      statusEl.textContent = `Successfully updated ${appliedCount} visible students!`;
    }
    
    setTimeout(() => { statusEl.textContent = ''; }, 6000);
    runBtn.disabled = false;
    runBtn.style.opacity = '1';
  }

  // Forces React to recognize programmatic text input changes
  function setReactInputValue(input, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------- MODULES PAGE CONTENT ----------
  function renderModulesContent(body) {
    const defaultText = "Attendance/Participation\nU1 Videos";
    const savedExcludeText = GM_getValue('savedExcludeText', defaultText);

    body.innerHTML = `
      <div style="font-weight:bold;margin-bottom:12px;font-size:14px;">Modules Quick Setup</div>
      
      <details open style="margin-bottom: 10px; border: 1px solid #ccc; padding: 6px; border-radius: 4px;">
        <summary style="font-weight:bold; cursor:pointer; user-select:none;">Bulk Indent / Unindent</summary>
        <div style="margin-top: 8px;">
          <p style="margin:0 0 6px 0;color:#555;">Exclude items if title contains (one per line):</p>
          <textarea id="tm-exclude-text" placeholder="e.g.\nOverview\nQuiz" rows="3" style="width:100%; box-sizing:border-box; margin-bottom:10px; padding:6px; resize:vertical; font-family:inherit;"></textarea>
          <div style="display:flex; gap:6px; margin-bottom:4px;">
            <button type="button" id="tm-indent-btn" style="flex:1; padding:6px; background:#0374B5; color:#fff; border:none; border-radius:4px; cursor:pointer;">Increase Indent</button>
            <button type="button" id="tm-outdent-btn" style="flex:1; padding:6px; background:#0374B5; color:#fff; border:none; border-radius:4px; cursor:pointer;">Decrease Indent</button>
          </div>
          <div id="tm-mod-status" style="margin-top:4px;color:#2d7d2d;font-size:12px;"></div>
        </div>
      </details>

      <details style="margin-bottom: 10px; border: 1px solid #ccc; padding: 6px; border-radius: 4px;">
        <summary style="font-weight:bold; cursor:pointer; user-select:none;">Add Weekday Headers</summary>
        <div style="margin-top: 8px;">
          <p style="margin:0 0 6px 0;color:#555;">Creates "Monday Assignments" to "Friday Assignments" text headers in the <b>first</b> module.</p>
          <button type="button" id="tm-add-headers-btn" style="width:100%; padding:6px; background:#0374B5; color:#fff; border:none; border-radius:4px; cursor:pointer;">
            Generate Headers
          </button>
          <div id="tm-headers-status" style="margin-top:6px;color:#2d7d2d;font-size:12px;"></div>
        </div>
      </details>
    `;

    const excludeTextArea = body.querySelector('#tm-exclude-text');
    excludeTextArea.value = savedExcludeText;
    excludeTextArea.addEventListener('input', (e) => {
      GM_setValue('savedExcludeText', e.target.value);
    });

    body.querySelector('#tm-indent-btn').addEventListener('click', () => applyIndent('indent', body));
    body.querySelector('#tm-outdent-btn').addEventListener('click', () => applyIndent('outdent', body));
    body.querySelector('#tm-add-headers-btn').addEventListener('click', () => applyWeekdayHeaders(body));
  }

  function applyIndent(action, body) {
    const rawText = body.querySelector('#tm-exclude-text').value;
    const statusEl = body.querySelector('#tm-mod-status');

    const excludeLines = rawText.split('\n')
                                .map(line => line.trim())
                                .filter(line => line.length > 0);

    if (excludeLines.length === 0) {
      statusEl.style.color = '#c00';
      statusEl.textContent = 'Please enter at least one phrase to exclude.';
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
      return;
    }

    const items = document.querySelectorAll('.context_module_item');
    let count = 0;

    items.forEach(item => {
      const titleEl = item.querySelector('.item_name .title');
      if (!titleEl) return;

      const titleText = titleEl.textContent.trim();
      const shouldExclude = excludeLines.some(excludePhrase => titleText.includes(excludePhrase));

      if (!shouldExclude) {
        const selector = action === 'indent' ? '.indent_item_link' : '.outdent_item_link';
        const btn = item.querySelector(selector);
        if (btn) {
          btn.click();
          count++;
        }
      }
    });

    statusEl.style.color = '#2d7d2d';
    statusEl.textContent = `Action '${action}' applied to ${count} items.`;
    setTimeout(() => { statusEl.textContent = ''; }, 4000);
  }

  async function applyWeekdayHeaders(body) {
    const statusEl = body.querySelector('#tm-headers-status');
    const runBtn = body.querySelector('#tm-add-headers-btn');
    
    const addButtons = document.querySelectorAll('.add_module_item_link');

    if (addButtons.length === 0) {
      statusEl.style.color = '#c00';
      statusEl.textContent = 'Could not find a module "+" (Add) button on this page.';
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
      return;
    }

    const targetAddBtn = addButtons[0];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    runBtn.disabled = true;
    runBtn.style.opacity = '0.5';
    statusEl.style.color = '#0374B5';

    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      statusEl.textContent = `Adding ${day} Assignments...`;
      
      targetAddBtn.click();

      try {
        const select = await findElement('#add_module_item_select', 5000);
        select.value = 'context_module_sub_header';
        select.dispatchEvent(new Event('change', { bubbles: true }));

        const titleInput = await findElement('#sub_header_title', 5000);
        titleInput.value = `${day} Assignments`;
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));

        await sleep(300);

        const submitBtn = await findElement('.add_item_button', 5000);
        submitBtn.click();

        await sleep(2000);
      } catch (err) {
        console.error('[TM] Error while generating header:', err);
        statusEl.style.color = '#c00';
        statusEl.textContent = `Failed on ${day}.`;
        runBtn.disabled = false;
        runBtn.style.opacity = '1';
        return;
      }
    }

    statusEl.style.color = '#2d7d2d';
    statusEl.textContent = 'All headers successfully added!';
    setTimeout(() => { statusEl.textContent = ''; }, 4000);
    runBtn.disabled = false;
    runBtn.style.opacity = '1';
  }

  // ---------- ASSIGNMENT EDIT PAGE CONTENT ----------
  function renderAssignmentContent(body) {
    body.innerHTML = `<p style="margin:0;color:#888;">Loading assignment form...</p>`;

    findElement('#assignment_points_possible', 20000).then((pointsInput) => {
      buildAssignmentControls(body, pointsInput);
    }).catch(() => {
      body.innerHTML = `
        <p style="margin:0 0 6px 0;color:#c00;">Couldn't find the Points field on this page.</p>
        <p style="margin:0;color:#888;font-size:12px;">
          Open the console (F12) and check the element ID — Canvas may be using a different
          assignment edit form on this instance.
        </p>`;
      console.warn('[TM] #assignment_points_possible not found within timeout.');
    });
  }

  function findElement(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        const el = document.querySelector(selector);
        if (el) resolve(el);
        else reject(new Error('timeout'));
      }, timeout);
    });
  }

  function buildAssignmentControls(body, pointsInput) {
    const savedPoints = GM_getValue('savedPoints', 0);

    body.innerHTML = `
      <div style="font-weight:bold;margin-bottom:8px;">Assignment Quick Setup</div>

      <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
        <input type="checkbox" id="tm-chk-points" checked>
        Set points to
        <input type="number" id="tm-saved-points" value="${savedPoints}" style="width:70px;">
        <button type="button" id="tm-save-points-btn" style="font-size:11px;">Save</button>
      </label>

      <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <input type="checkbox" id="tm-chk-submission" checked>
        Submission: Online → File Uploads → jpg,png
      </label>

      <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <input type="checkbox" id="tm-chk-cleanhtml" checked>
        Clean description formatting (HTML editor)
      </label>

      <label style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
        <input type="checkbox" id="tm-chk-replace-text" checked>
        Replace "the Submission Button" → "File Upload"
      </label>

      <button type="button" id="tm-apply-btn" style="padding:6px 14px;background:#0374B5;color:#fff;border:none;border-radius:4px;cursor:pointer;width:100%;">
        Apply Selected
      </button>
      <div id="tm-status" style="margin-top:8px;color:#2d7d2d;font-size:12px;"></div>
    `;

    body.querySelector('#tm-save-points-btn').addEventListener('click', () => {
      const val = parseFloat(body.querySelector('#tm-saved-points').value);
      if (!isNaN(val)) {
        GM_setValue('savedPoints', val);
        setStatus(body, 'Points value saved: ' + val);
      }
    });

    body.querySelector('#tm-apply-btn').addEventListener('click', () => {
      applyActions(body);
    });
  }

  function setStatus(body, msg) {
    const status = body.querySelector('#tm-status');
    if (status) {
      status.textContent = msg;
      setTimeout(() => { status.textContent = ''; }, 4000);
    }
  }

  async function applyActions(body) {
    const doPoints = body.querySelector('#tm-chk-points').checked;
    const doSubmission = body.querySelector('#tm-chk-submission').checked;
    const doCleanHtml = body.querySelector('#tm-chk-cleanhtml').checked;
    const doReplace = body.querySelector('#tm-chk-replace-text').checked;

    const log = [];

    if (doPoints) {
      const val = body.querySelector('#tm-saved-points').value;
      setPoints(val);
      GM_setValue('savedPoints', parseFloat(val) || 0);
      log.push('points set');
    }

    if (doSubmission) {
      await setSubmissionType();
      log.push('submission type set');
    }

    if (doCleanHtml) {
      const ok = await cleanDescriptionFormatting();
      log.push(ok ? 'formatting cleaned' : 'formatting clean FAILED');
    }

    if (doReplace) {
      await sleep(500);
      replaceDescriptionText();
      log.push('text replaced');
    }

    setStatus(body, 'Done: ' + (log.join(', ') || 'nothing selected'));
  }

  function setPoints(value) {
    const input = document.querySelector('#assignment_points_possible');
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function setSubmissionType() {
    const select = document.querySelector('#assignment_submission_type');
    if (select) {
      select.value = 'online';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    await sleep(400);

    const fileUploadChk = document.querySelector('#assignment_online_upload');
    if (fileUploadChk && !fileUploadChk.checked) fileUploadChk.click();

    await sleep(300);

    const restrictChk = document.querySelector('#assignment_restrict_file_extensions');
    if (restrictChk && !restrictChk.checked) restrictChk.click();

    await sleep(300);

    const extInput = document.querySelector('#assignment_allowed_extensions');
    if (extInput) {
      extInput.value = 'jpg,png';
      extInput.dispatchEvent(new Event('input', { bubbles: true }));
      extInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function replaceDescriptionText() {
    const iframe = document.querySelector('#assignment_description_ifr');
    if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
      const doc = iframe.contentDocument.body;
      doc.innerHTML = doc.innerHTML.replace(/the Submission Button/gi, 'File Upload');
      return;
    }
    const textarea = document.querySelector('#assignment_description');
    if (textarea) {
      textarea.value = textarea.value.replace(/the Submission Button/gi, 'File Upload');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // ---------- CLEAN DESCRIPTION FORMATTING (via raw HTML editor toggle) ----------
  async function cleanDescriptionFormatting() {
    const iframe = document.querySelector('#assignment_description_ifr');
    if (!iframe || !iframe.contentDocument || !iframe.contentDocument.body) {
      console.warn('[TM] Description RCE iframe not found.');
      return false;
    }

    const originalHtml = iframe.contentDocument.body.innerHTML;
    const cleanedHtml = sanitizeDescriptionHtml(originalHtml);

    const htmlBtn = document.querySelector('[data-btn-id="rce-edit-btn"]');
    if (!htmlBtn) {
      console.warn('[TM] HTML editor toggle button (rce-edit-btn) not found.');
      return false;
    }

    htmlBtn.click();

    const cmContent = await waitForCodeMirrorContent();
    if (!cmContent) {
      console.warn('[TM] CodeMirror content element (.cm-content) not found after switching.');
      htmlBtn.click(); 
      return false;
    }

    await sleep(200);
    const success = setCodeMirrorContent(cmContent, cleanedHtml);
    
    await sleep(250);
    htmlBtn.click();
    await sleep(400);

    return success;
  }

  function waitForCodeMirrorContent(timeout = 8000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const el = document.querySelector('.cm-content[contenteditable="true"]');
        if (el) { resolve(el); return; }
        if (Date.now() - start > timeout) { resolve(null); return; }
        requestAnimationFrame(check);
      };
      check();
    });
  }

  function setCodeMirrorContent(cmContent, text) {
    cmContent.focus();

    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(cmContent);
    sel.removeAllRanges();
    sel.addRange(range);

    let success = false;
    try {
      success = document.execCommand('insertText', false, text);
    } catch (e) {
      success = false;
    }

    if (!success) {
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true
        });
        success = cmContent.dispatchEvent(pasteEvent);
      } catch (e) {
        success = false;
      }
    }

    return success;
  }

  function sanitizeDescriptionHtml(html) {
    const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'A', 'UL', 'OL', 'LI']);

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="tm-root">${html}</div>`, 'text/html');
    const root = doc.getElementById('tm-root');

    root.querySelectorAll('.sch-grade-item-attachments, a.sch-grade-item-attachments-item')
      .forEach(el => el.remove());

    function walk(node) {
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child); 

          if (ALLOWED_TAGS.has(child.tagName)) {
            Array.from(child.attributes).forEach(attr => {
              if (!(child.tagName === 'A' && attr.name === 'href')) {
                child.removeAttribute(attr.name);
              }
            });
            if (child.tagName === 'A' && child.textContent.replace(/\u00a0/g, ' ').trim() === '') {
              child.remove();
            }
          } else {
            while (child.firstChild) {
              node.insertBefore(child.firstChild, child);
            }
            node.removeChild(child);
          }
        } else if (child.nodeType === Node.COMMENT_NODE) {
          child.remove();
        }
      });
    }

    walk(root);

    root.querySelectorAll('li').forEach(li => {
      if (li.textContent.replace(/\u00a0/g, ' ').trim() === '' && li.children.length === 0) {
        li.remove();
      }
    });
    root.querySelectorAll('ul, ol').forEach(list => {
      if (list.children.length === 0) list.remove();
    });

    return root.innerHTML.trim();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();