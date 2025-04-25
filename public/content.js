(function () {
  // Constants
  const STORAGE_KEY = "chatgpt_bookmarks";
  const isChatGPT =
    window.location.hostname === "chat.openai.com" ||
    window.location.hostname === "chatgpt.com";

  // Data structure for bookmarks
  let bookmarks = {};
  let currentConversationId = null;
  let starsVisible = true;

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
  } else {
    initializeExtension();
  }

  // Backup initialization
  window.addEventListener('load', initializeExtension);

  function initializeExtension() {
    if (!isChatGPT) return;
    console.log("ChatGPT detected. Initializing bookmark system...");

    // Remove existing UI if present
    const existingButton = document.getElementById("bookmark-button-container");
    if (existingButton) {
      existingButton.remove();
    }

    // Initialize the bookmark system
    initBookmarkSystem();

    // Set up observers for dynamic content
    setupObservers();
  }

  function setupObservers() {
    // Observer for UI changes
    const uiObserver = new MutationObserver(() => {
      const buttonContainer = document.getElementById("bookmark-button-container");
      if (!buttonContainer) {
        console.log("Bookmark button missing, recreating...");
        createBookmarkUI();
      }
    });

    // Start observing
    uiObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Main initialization function
  function initBookmarkSystem() {
    if (document.getElementById("bookmark-button-container")) return;

    createBookmarkUI();
    getCurrentConversationId();
    if (currentConversationId) loadBookmarks();

    setupUrlChangeListener();
    toggleStarsVisibility(starsVisible);

    // Observe DOM changes for new messages
    const observer = new MutationObserver(() => {
      if (!document.getElementById("bookmark-button-container")) {
        createBookmarkUI();
        getCurrentConversationId();
        if (currentConversationId) loadBookmarks();
      }
      if (starsVisible) addStarButtonsToNewMessages();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Add keyboard shortcut listener
    document.addEventListener("keydown", handleKeyboardShortcuts);

    ////////////////////////////////////////// 检查表格和csv信息 ////////////////////////////////////////////////////////////
    // 添加表格检测的observer
    // 添加表格检测的observer
    const tableObserver = new MutationObserver((mutations) => {
      console.log('Mutations detected:', mutations.length); // 添加日志

      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
          console.log('Added nodes:', mutation.addedNodes.length); // 添加日志

          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // 元素节点
              console.log('Checking element node:', node.tagName); // 添加日志

              // 检查该节点
              checkForTablesAndCSV([node]);

              // 检查其子节点
              const container = node.querySelector('.markdown-body, .message-content');
              if (container) {
                console.log('Found content container, checking children'); // 添加日志
                checkForTablesAndCSV([container]);
              }
            }
          });
        }
      });
    });

    // 查找聊天容器
    const chatContainer = document.querySelector('main, .conversation-container');
    if (chatContainer) {
      console.log('Found chat container, starting observation'); // 添加日志
      tableObserver.observe(chatContainer, {
        childList: true,
        subtree: true,
        characterData: true
      });
    } else {
      console.log('Chat container not found'); // 添加日志
    }
    ////////////////////////////////////////// 检查表格和csv信息 ////////////////////////////////////////////////////////////
  }

  ////////////////////////////////////////// 检查表格和csv信息 ////////////////////////////////////////////////////////////
  // 添加新的函数来检查表格和csv输出：
  function checkForTablesAndCSV(nodes) {
    console.log('Checking nodes:', nodes.length);

    nodes.forEach(node => {
      // 检查是否已经添加过按钮
      if (node.querySelector('.google-sheets-export-button')) {
        console.log('Button already exists, skipping');
        return;
      }

      // 检查预格式化内容（代码块、Markdown 表格等）
      const preElements = node.querySelectorAll('pre');
      preElements.forEach(pre => {
        if (pre.querySelector('.google-sheets-export-button')) return;

        const codeElement = pre.querySelector('code');
        const content = codeElement ? codeElement.textContent : pre.textContent;

        if (isMarkdownTable(content)) {
          console.log('Found Markdown table in pre element');
          try {
            const tableData = parseMarkdownTable(content);
            if (tableData.headers.length > 0) {
              console.log('Valid table found, adding button');
              addGoogleSheetsButton(pre, tableData);
            }
          } catch (e) {
            console.error('Error parsing markdown table:', e);
          }
        } else if (isCSVContent(content)) {
          console.log('Found CSV content in pre element');
          try {
            const tableData = parseCSVContent(content);
            if (tableData.headers.length > 0) {
              console.log('Valid CSV found, adding button');
              addGoogleSheetsButton(pre, tableData);
            }
          } catch (e) {
            console.error('Error parsing CSV content:', e);
          }
        }
      });

      // 检查 HTML 表格
      const tables = node.querySelectorAll('table');
      tables.forEach(table => {
        if (table.querySelector('.google-sheets-export-button')) return;

        console.log('Found HTML table');
        try {
          const tableData = parseHTMLTable(table);
          if (tableData.headers.length > 0) {
            console.log('Valid HTML table found, adding button');
            addGoogleSheetsButton(table, tableData);
          }
        } catch (e) {
          console.error('Error parsing HTML table:', e);
        }
      });

      // 检查 CSV 链接
      const links = node.querySelectorAll('a[href$=".csv"]');
      links.forEach(link => {
        if (link.nextElementSibling && link.nextElementSibling.classList.contains('google-sheets-export-button')) return;

        console.log('Found CSV link:', link.href);
        addGoogleSheetsButton(link, null, link.href);
      });
    });
  }

  // 添加 CSV 内容检测函数
  function isCSVContent(content) {
    // 检查是否有多行且包含逗号
    const lines = content.trim().split('\n');
    if (lines.length < 2) return false;

    // 检查每行是否都包含逗号，且逗号数量一致
    const firstLineCommas = (lines[0].match(/,/g) || []).length;
    if (firstLineCommas === 0) return false;

    // 检查至少前 3 行（或全部行，如果少于 3 行）
    const linesToCheck = Math.min(3, lines.length);
    for (let i = 0; i < linesToCheck; i++) {
      const commas = (lines[i].match(/,/g) || []).length;
      if (commas === 0 || (i > 0 && commas !== firstLineCommas)) {
        return false;
      }
    }

    return true;
  }

  // 添加 CSV 内容解析函数
  function parseCSVContent(content) {
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    const data = lines.slice(1).map(line =>
      line.split(',').map(cell => cell.trim())
    );

    return { headers, data };
  }

  // 添加 HTML 表格解析函数
  function parseHTMLTable(table) {
    const headers = [];
    const headerRow = table.querySelector('thead tr') || table.querySelector('tr:first-child');

    if (headerRow) {
      const headerCells = headerRow.querySelectorAll('th, td');
      headerCells.forEach(cell => {
        headers.push(cell.textContent.trim());
      });
    }

    const data = [];
    const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
    rows.forEach(row => {
      const rowData = [];
      const cells = row.querySelectorAll('td');
      cells.forEach(cell => {
        rowData.push(cell.textContent.trim());
      });
      if (rowData.length > 0) {
        data.push(rowData);
      }
    });

    return { headers, data };
  }

  // 添加新的辅助函数来改进表格检测
  function isMarkdownTable(content) {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return false;

    // 检查是否包含表格分隔符行
    const separatorLine = lines[1];
    if (!separatorLine) return false;

    const isTableSeparator = separatorLine.trim().replace(/[\|\-:\s]/g, '').length === 0
      && separatorLine.includes('|')
      && separatorLine.includes('-');

    // 检查第一行是否包含列标题
    const hasHeaders = lines[0].includes('|');

    return isTableSeparator && hasHeaders;
  }

  // 对Markdown表格进行解析
  function parseMarkdownTable(markdownTable) {
    try {
      const rows = markdownTable.trim().split('\n');

      // 确保至少有标题行和分隔行
      if (rows.length < 2) return { headers: [], data: [] };

      // 处理标题行
      const headerRow = rows[0].trim();
      const headers = headerRow
        .split('|')
        .map(cell => cell.trim())
        .filter(cell => cell.length > 0);

      // 验证分隔行
      const separatorRow = rows[1].trim();
      const isValidSeparator = separatorRow
        .split('|')
        .every(cell => cell.trim().replace(/[-:\s]/g, '').length === 0);

      if (!isValidSeparator) return { headers: [], data: [] };

      // 处理数据行
      const data = rows.slice(2)
        .filter(row => row.trim() && row.includes('|'))
        .map(row =>
          row
            .split('|')
            .map(cell => cell.trim())
            .filter(cell => cell.length > 0)
        );

      console.log('Parsed table:', { headers, data });
      return { headers, data };
    } catch (e) {
      console.error('Error parsing table:', e);
      return { headers: [], data: [] };
    }
  }

  // 添加Google Sheets按钮
  function addGoogleSheetsButton(element, tableData, csvUrl = null) {
    const button = document.createElement('button');
    button.className = 'google-sheets-export-button';
    button.innerHTML = `
      <img src="https://www.google.com/images/about/sheets-icon.svg" 
           alt="Export to Google Sheets" 
           style="width: 20px; height: 20px;">
    `;
    button.style = `
      background: none;
      border: none;
      cursor: pointer;
      padding: 5px;
      margin-left: 10px;
      vertical-align: middle;
      transition: transform 0.2s;
      display: inline-flex;
      align-items: center;
    `;

    button.title = "Export to Google Sheets";

    button.addEventListener('mouseenter', () => {
      button.style.transform = 'scale(1.1)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = 'scale(1)';
    });

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (csvUrl) {
          await exportCSVToGoogleSheets(csvUrl);
        } else if (tableData) {
          await exportTableToGoogleSheets(tableData);
        }
      } catch (error) {
        console.error('Export failed:', error);
        alert('Failed to export to Google Sheets. Please try again.');
      }
    });

    // 如果是链接，在链接后面添加按钮
    if (element.tagName === 'A') {
      element.parentNode.insertBefore(button, element.nextSibling);
    } else {
      // 如果是表格，在表格容器后面添加按钮
      const container = document.createElement('div');
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.justifyContent = 'flex-end';
      container.style.marginTop = '5px';
      container.appendChild(button);
      element.parentNode.insertBefore(container, element.nextSibling);
    }
  }

  // 导出CSV到Google Sheets
  async function exportCSVToGoogleSheets(csvUrl) {
    try {
      const csvData = await fetchCSVData(csvUrl);
      const tableData = parseCSVData(csvData);
      await exportTableToGoogleSheets(tableData);
    } catch (error) {
      console.error('Error processing CSV:', error);
      alert('Failed to process CSV file. Please try again.');
    }
  }

  // Google API authentication and sheets creation
  async function getGoogleAccessToken() {
    try {
      return new Promise((resolve, reject) => {
        // 确保 chrome.runtime 存在
        if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
          console.error('Chrome runtime API not available');
          reject(new Error('Chrome extension API not available. Please reload the page.'));
          return;
        }

        chrome.runtime.sendMessage({ action: "getAuthToken" }, response => {
          // 检查是否有 chrome.runtime.lastError
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error('Auth error:', lastError.message);
            reject(new Error(lastError.message));
            return;
          }

          if (response && response.token) {
            console.log('Successfully got auth token');
            resolve(response.token);
          } else if (response && response.error) {
            console.error('Auth error:', response.error);
            reject(new Error(response.error));
          } else {
            console.error('No response or invalid response');
            reject(new Error('Failed to get auth token'));
          }
        });
      });
    } catch (error) {
      console.error('Error in getGoogleAccessToken:', error);
      throw error;
    }
  }

  async function createGoogleSheet(accessToken, tableData) {
    try {
      console.log('Creating new sheet with access token:', accessToken ? 'Token exists' : 'No token');

      if (!accessToken) {
        throw new Error('No access token provided');
      }

      if (!tableData || !tableData.headers || !tableData.data) {
        throw new Error('Invalid table data provided');
      }

      console.log('Table data to be exported:', tableData);

      // 创建新的空白表格
      const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: `ChatGPT Export ${new Date().toLocaleDateString()}`
          }
        })
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('Sheet creation failed:', errorText);
        throw new Error(`Failed to create sheet: ${errorText}`);
      }

      const sheet = await createResponse.json();
      console.log('Sheet created:', sheet.spreadsheetId);

      // 确保数据行数与表头匹配
      const cleanData = tableData.data.map(row => {
        // 如果行的列数小于表头数，添加空单元格
        if (row.length < tableData.headers.length) {
          return [...row, ...Array(tableData.headers.length - row.length).fill('')];
        }
        // 如果行的列数大于表头数，截断多余的单元格
        if (row.length > tableData.headers.length) {
          return row.slice(0, tableData.headers.length);
        }
        return row;
      });

      // 添加辅助函数来将列数转换为字母列标识符
      function getColumnLetter(columnNumber) {
        let columnLetter = '';
        let temp = columnNumber;

        while (temp > 0) {
          let remainder = temp % 26 || 26;
          columnLetter = String.fromCharCode(64 + remainder) + columnLetter;
          temp = Math.floor((temp - remainder) / 26);
        }

        return columnLetter;
      }

      // 写入数据
      const updateResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/A1:${getColumnLetter(tableData.headers.length)}${cleanData.length + 1}?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [tableData.headers, ...cleanData],
            majorDimension: "ROWS"
          })
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('Data update failed:', errorText);
        throw new Error(`Failed to update sheet data: ${errorText}`);
      }

      console.log('Sheet data updated successfully');

      // 设置第一行为冻结并加粗（表头）
      const formatResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            requests: [
              {
                updateSheetProperties: {
                  properties: {
                    sheetId: 0,
                    gridProperties: {
                      frozenRowCount: 1
                    }
                  },
                  fields: 'gridProperties.frozenRowCount'
                }
              },
              {
                repeatCell: {
                  range: {
                    sheetId: 0,
                    startRowIndex: 0,
                    endRowIndex: 1
                  },
                  cell: {
                    userEnteredFormat: {
                      textFormat: {
                        bold: true
                      }
                    }
                  },
                  fields: 'userEnteredFormat.textFormat.bold'
                }
              }
            ]
          })
        }
      );

      if (!formatResponse.ok) {
        console.warn('Format update failed, but data was saved');
      }

      return {
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}/edit`
      };
    } catch (error) {
      console.error('Error in createGoogleSheet:', error);
      throw error;
    }
  }

  async function fetchCSVData(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch CSV: ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
      console.error('Error fetching CSV:', error);
      throw error;
    }
  }

  function parseCSVData(csvText) {
    if (!csvText || typeof csvText !== 'string') {
      throw new Error('Invalid CSV data');
    }

    const lines = csvText.split(/\r\n|\n|\r/).filter(line => line.trim());

    if (lines.length === 0) {
      throw new Error('Empty CSV file');
    }

    // 检测分隔符 - 逗号或制表符
    const firstLine = lines[0];
    const delimiter = firstLine.includes('\t') ? '\t' : ',';

    // 解析标题行
    const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));

    // 解析数据行
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      // 简单的 CSV 解析，不处理引号内的逗号
      const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));

      // 确保有内容
      if (values.some(v => v.trim())) {
        data.push(values);
      }
    }

    return { headers, data };
  }

  ////////////////////////////////////////// 检查表格和csv信息 ////////////////////////////////////////////////////////////

  //////////////////////////////////////// 删除drawer中的特定条目 //////////////////////////////////////////////////////////
  // 添加一个简单的确认对话框来实现：
  function showCustomConfirmation(message) {
    return new Promise((resolve) => {
      const confirmed = window.confirm(message);
      resolve(confirmed);
    });
  }

  // 确保 URL 发生变化时重新加载书签：
  function setupUrlChangeListener() {
    let lastUrl = window.location.href;

    // 创建一个观察期来检测 URL 变化
    const observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        // URL 已更改，获取新的对话 ID 病假在相应的数千
        currentConversationId = getCurrentConversationId();
        if (currentConversationId) {
          loadBookmarks();
        } else {
          // 如果不在对话页面，清空书签列表
          populateBookmarkList([]);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  //////////////////////////////////////// 删除drawer中的特定条目 //////////////////////////////////////////////////////////

  // Get the current conversation ID
  function getCurrentConversationId() {
    const match = window.location.pathname.match(/\/c\/([\w-]+)/);
    if (match && match[1]) {
      currentConversationId = match[1];
      console.log("Current conversation ID:", currentConversationId);
      return currentConversationId;
    }
    return null;
  }

  // Load bookmarks from Chrome storage
  function loadBookmarks() {
    // 同时要确保每个对话对应一个独立的drawer
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      bookmarks = result[STORAGE_KEY] || {};
      // 确保当前对话 ID 存在
      if (currentConversationId) {
        bookmarks[currentConversationId] = bookmarks[currentConversationId] || [];
        populateBookmarkList(bookmarks[currentConversationId]);
      } else {
        // 如果没有当前对话 ID，清空书签列表
        populateBookmarkList([]);
      }
    });
  }

  // Save bookmarks to Chrome storage
  function saveBookmarks() {
    chrome.storage.local.set({ [STORAGE_KEY]: bookmarks }, () => {
      console.log("Bookmarks saved successfully");
    });
  }

  // Create all UI elements
  function createBookmarkUI() {
    const bookmarkButtonContainer = document.createElement("div");
    bookmarkButtonContainer.id = "bookmark-button-container";
    bookmarkButtonContainer.style = `
      position: fixed; right: 20px; bottom: 100px; z-index: 9999;
      width: 50px; height: 50px; border-radius: 50%;
      background-color: #4CAF50; display: flex; justify-content: center;
      align-items: center; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      transition: transform 0.2s, background-color 0.2s;
    `;
    bookmarkButtonContainer.addEventListener("mouseenter", () => {
      bookmarkButtonContainer.style.transform = "scale(1.1)";
      const drawer = document.getElementById("bookmark-drawer");
      if (drawer) {
        drawer.style.right = "0px";
      }
    });

    bookmarkButtonContainer.addEventListener("mouseleave", (e) => {
      bookmarkButtonContainer.style.transform = "scale(1)";
      const drawer = document.getElementById("bookmark-drawer");
      if (drawer) {
        // 检查鼠标是否移动到了 drawer 上
        const rect = drawer.getBoundingClientRect();
        if (!(e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom)) {
          drawer.style.right = "-350px";
        }
      }
    });

    const bookmarkButton = document.createElement("button");
    bookmarkButton.innerHTML = "🔖";
    bookmarkButton.style = `
      border: none; background: transparent; font-size: 24px;
      color: white; cursor: pointer;
    `;
    bookmarkButton.title = "Toggle bookmark stars (Alt+B)";
    bookmarkButton.addEventListener("click", () => {
      starsVisible = !starsVisible;
      toggleStarsVisibility(starsVisible);
      bookmarkButtonContainer.style.backgroundColor = starsVisible ? "#FFC107" : "#4CAF50";
    });
    bookmarkButtonContainer.appendChild(bookmarkButton);
    document.body.appendChild(bookmarkButtonContainer);

    // 创建drawer里面的搜索栏：
    function createSearchBox() {
      const searchContainer = document.createElement('div');
      searchContainer.style = `
        margin-bottom: 15px;
        padding: 10px 0;
        border-bottom: 1px solid #eee;
      `;

      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Search bookmarks...';
      searchInput.style = `
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
      `;

      searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const bookmarkItems = document.querySelectorAll('#bookmark-list li');

        bookmarkItems.forEach(item => {
          const text = item.querySelector('span').innerText.toLowerCase();
          item.style.display = text.includes(searchTerm) ? 'flex' : 'none';
        });
      });

      searchContainer.appendChild(searchInput);
      return searchContainer;
    }

    const drawer = document.createElement("div");
    drawer.id = "bookmark-drawer";
    drawer.style = `
      position: fixed; top: 0; right: -350px; width: 350px; height: 100%;
      background-color: #fff; box-shadow: 0px 0px 10px rgba(0,0,0,0.5);
      overflow-y: auto; transition: right 0.3s; z-index: 9998; padding: 20px;
    `;

    // 修改 bookmarkButton 的点击事件处理
    bookmarkButton.addEventListener("click", () => {
      starsVisible = !starsVisible;
      toggleStarsVisibility(starsVisible);

      // 切换按钮颜色
      bookmarkButtonContainer.style.backgroundColor = starsVisible ? "#FFC107" : "#4CAF50";

      // 切换 drawer 的显示状态
      const drawer = document.getElementById("bookmark-drawer");
      if (drawer) {
        if (drawer.style.right === "0px") {
          drawer.style.right = "-350px";
          drawer.dataset.pinned = "false";
        } else {
          drawer.style.right = "0px";
          // 固定 drawer
          drawer.dataset.pinned = "true";
        }
      }
    });

    // 修改 drawer 的鼠标离开事件
    drawer.addEventListener("mouseleave", () => {
      // 只有在未固定状态下才自动关闭
      if (drawer.dataset.pinned !== "true") {
        drawer.style.right = "-350px";
      }
    });

    // 添加点击文档其他区域关闭 drawer 的事件
    document.addEventListener("click", (e) => {
      const drawer = document.getElementById("bookmark-drawer");
      const bookmarkButtonContainer = document.getElementById("bookmark-button-container");

      if (drawer && drawer.dataset.pinned === "true") {
        // 如果点击的不是 drawer 或 bookmark 按钮，则关闭 drawer
        if (!drawer.contains(e.target) && !bookmarkButtonContainer.contains(e.target)) {
          drawer.style.right = "-350px";
          drawer.dataset.pinned = "false";

          // 如果星标可见，则保持图标为黄色，否则恢复为绿色
          bookmarkButtonContainer.style.backgroundColor = starsVisible ? "#FFC107" : "#4CAF50";
        }
      }
    });

    document.body.appendChild(drawer);


    const drawerHeader = document.createElement("div");
    drawerHeader.style = `
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px;
    `;
    const drawerTitle = document.createElement("h2");
    drawerTitle.innerText = "Bookmarked Items";
    drawerTitle.style = "margin: 0; color: #333;";
    drawerHeader.appendChild(drawerTitle);

    const closeButton = document.createElement("button");
    closeButton.innerHTML = "✕";
    closeButton.style = `
      border: none; background: transparent; font-size: 18px;
      color: #666; cursor: pointer;
    `;
    closeButton.addEventListener("click", () => {
      drawer.style.right = "-350px";
    });
    drawerHeader.appendChild(closeButton);
    drawer.appendChild(drawerHeader);

    const bookmarkList = document.createElement("ul");
    bookmarkList.id = "bookmark-list";
    bookmarkList.style = "list-style: none; padding: 0; margin: 0;";
    drawer.appendChild(bookmarkList);

    // 在drawer中添加搜索框
    drawer.insertBefore(createSearchBox(), bookmarkList);
  }

  // Add a bookmark to the drawer
  function addBookmarkToDrawer(bookmark) {
    const listItem = document.createElement("li");
    listItem.draggable = true;
    listItem.dataset.bookmarkId = bookmark.id;
    listItem.style = `
      display: flex; align-items: center; margin-bottom: 10px;
      padding: 10px; border: 1px solid #eee; border-radius: 4px;
      transition: background-color 0.2s;
    `;
    listItem.addEventListener("mouseenter", () => {
      listItem.style.backgroundColor = "#f5f5f5";
    });
    listItem.addEventListener("mouseleave", () => {
      listItem.style.backgroundColor = "transparent";
    });

    // 添加拖拽事件处理逻辑：
    listItem.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", bookmark.id);
      listItem.classList.add("dragging");
      listItem.style.opacity = "0.5";
    });
    listItem.addEventListener("dragend", () => {
      listItem.classList.remove("dragging"); // 添加这行
      listItem.style.opacity = "1";
    });
    listItem.addEventListener("dragover", (e) => {
      e.preventDefault();
      const draggingElement = document.querySelector(".dragging");
      if (draggingElement && draggingElement !== listItem) {
        const bookmarkList = document.getElementById("bookmark-list");
        const siblings = [...bookmarkList.querySelectorAll("li:not(.dragging)")];

        const nextSibling = siblings.find(sibling => {
          const rect = sibling.getBoundingClientRect();
          const offset = e.clientY - rect.top - rect.height / 2;
          return offset < 0;
        });

        bookmarkList.insertBefore(draggingElement, nextSibling || null);
      }
    });
    // 将拖拽后的新顺序保存：
    document.getElementById("bookmark-list").addEventListener("dragend", () => {
      const newOrder = Array.from(document.querySelectorAll('#bookmark-list li')).map(item => item.dataset.bookmarkId);
      bookmarks[currentConversationId] = newOrder.map(id => bookmarks[currentConversationId].find(b => b.id === id));
      saveBookmarks();
    });

    const nameSpan = document.createElement("span");
    nameSpan.innerText = bookmark.name;
    nameSpan.style = `
      flex-grow: 1; cursor: pointer; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
    `;
    nameSpan.title = bookmark.content;
    nameSpan.addEventListener("click", () => {
      scrollToMessage(bookmark.id);
    });
    listItem.appendChild(nameSpan);

    const buttonContainer = document.createElement("div");
    buttonContainer.style = "display: flex; margin-left: 8px;";

    const editButton = document.createElement("button");
    editButton.innerHTML = "✏️";
    editButton.style = `
      margin-left: 5px; cursor: pointer; border: none;
      background: transparent; font-size: 14px;
    `;
    editButton.title = "Rename bookmark";
    editButton.addEventListener("click", () => {
      const newName = prompt("Enter new name for bookmark:", bookmark.name);
      if (newName && newName.trim() !== "") {
        nameSpan.innerText = newName;
        const bookmarkIndex = bookmarks[currentConversationId].findIndex((b) => b.id === bookmark.id);
        if (bookmarkIndex !== -1) {
          bookmarks[currentConversationId][bookmarkIndex].name = newName;
          saveBookmarks();
        }
      }
    });
    buttonContainer.appendChild(editButton);

    const deleteButton = document.createElement("button");
    deleteButton.innerHTML = "❌";
    deleteButton.style = `
      margin-left: 5px; cursor: pointer; border: none;
      background: transparent; font-size: 14px;
    `;
    deleteButton.title = "Delete bookmark";
    deleteButton.addEventListener("click", async () => {
      const confirmed = await showCustomConfirmation("Are you sure you want to delete this bookmark?");
      if (confirmed) {
        listItem.remove();
        const bookmarkIndex = bookmarks[currentConversationId].findIndex((b) => b.id === bookmark.id);
        if (bookmarkIndex !== -1) {
          bookmarks[currentConversationId].splice(bookmarkIndex, 1);
          saveBookmarks();
        }
      }
    });
    buttonContainer.appendChild(deleteButton);

    listItem.appendChild(buttonContainer);
    document.getElementById("bookmark-list").appendChild(listItem);
  }

  // Scroll to a message by ID
  function scrollToMessage(messageId) {
    const targetElement = document.getElementById(messageId);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
      const originalBackground = targetElement.style.backgroundColor;
      targetElement.style.backgroundColor = "rgba(255, 230, 0, 0.2)";
      setTimeout(() => {
        targetElement.style.backgroundColor = originalBackground;
      }, 2000);
    }
  }

  // Custom confirmation dialog
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'chatgpt-bookmark-notification';
    notification.style = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 10px 20px;
      border-radius: 5px;
      background-color: ${type === 'error' ? '#f44336' : '#4CAF50'};
      color: white;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      transition: opacity 0.3s;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }

  // 在 exportTableToGoogleSheets 函数中添加通知
  async function exportTableToGoogleSheets(tableData) {
    try {
      console.log('Attempting to export table:', tableData);
      // 显示正在处理的通知
      showNotification('Exporting to Google Sheets...');

      const accessToken = await getGoogleAccessToken();
      console.log('Got access token');

      const response = await createGoogleSheet(accessToken, tableData);
      console.log('Sheet created:', response);

      if (response.spreadsheetUrl) {
        // 成功通知
        showNotification('Successfully exported to Google Sheets!');
        window.open(response.spreadsheetUrl, '_blank');
      }
    } catch (error) {
      console.error('Error exporting to Google Sheets:', error);
      // 错误通知
      showNotification(`Export failed: ${error.message}`, 'error');

      if (error.message.includes('auth')) {
        showNotification('Authentication failed. Please ensure you are signed into Chrome.', 'error');
      }
    }
  }

  // Populate bookmark list from loaded data
  function populateBookmarkList(bookmarkData) {
    const bookmarkList = document.getElementById("bookmark-list");
    if (!bookmarkList) return;
    bookmarkList.innerHTML = "";
    bookmarkData.forEach((bookmark) => addBookmarkToDrawer(bookmark));
  }


  // 在toggleStarsVisibility函数中修改添加星标按钮的部分
  // 修改 toggleStarsVisibility 函数来使用图片
  function toggleStarsVisibility(visible) {
    const messages = document.querySelectorAll("[data-message-author-role]");

    messages.forEach((message) => {
      // 如果message没有ID，为其分配一个
      if (!message.id) {
        const role = message.getAttribute("data-message-author-role");
        const type = role === "user" ? "question" : "answer";
        const existingElements = document.querySelectorAll(`[id^="${type}-"]`);
        const counter = existingElements.length + 1;
        message.id = `${type}-${counter}`;
      }

      // 检查消息是否已有星标按钮
      if (!message.querySelector(".star-button")) {
        const starButton = document.createElement("button");

        // 使用灰色和金色星星图片
        starButton.innerHTML = `
        <img src="${chrome.runtime.getURL('icons/grey-star.png')}" 
             class="star-icon grey" 
             alt="Add bookmark" 
             style="width: 16px; height: 16px; display: inline-block;">
        <img src="${chrome.runtime.getURL('icons/gold-star.png')}" 
             class="star-icon gold" 
             alt="Add bookmark" 
             style="width: 16px; height: 16px; display: none;">
      `;

        starButton.className = "star-button";
        starButton.style = `
        margin-left: 10px;
        cursor: pointer;
        border: none;
        background: transparent;
        transition: transform 0.2s;
        display: ${visible ? "inline-block" : "none"};
      `;
        starButton.title = "Add bookmark";
        starButton.dataset.messageId = message.id;

        // 悬停效果
        starButton.addEventListener("mouseenter", () => {
          starButton.style.transform = "scale(1.2)";
          // 检查是否已被标记为书签
          const isBookmarked = checkIfBookmarked(message.id);
          if (!isBookmarked) {
            // 显示金色星星
            starButton.querySelector('.star-icon.grey').style.display = "none";
            starButton.querySelector('.star-icon.gold').style.display = "inline-block";
          }
        });

        starButton.addEventListener("mouseleave", () => {
          // 检查是否已被标记为书签
          const isBookmarked = checkIfBookmarked(message.id);
          if (!isBookmarked) {
            starButton.style.transform = "scale(1)";
            // 恢复显示灰色星星
            starButton.querySelector('.star-icon.grey').style.display = "inline-block";
            starButton.querySelector('.star-icon.gold').style.display = "none";
          }
        });

        // 点击效果
        starButton.addEventListener("click", () => {
          const isBookmarked = checkIfBookmarked(message.id);

          if (!isBookmarked) {
            // 添加明显的动画效果
            starButton.style.transform = "scale(1.5)";
            setTimeout(() => {
              starButton.style.transform = "scale(1.2)";
            }, 200);

            // 永久显示金色星星
            starButton.querySelector('.star-icon.grey').style.display = "none";
            starButton.querySelector('.star-icon.gold').style.display = "inline-block";

            // 添加书签
            addBookmark(message);
          }
        });

        // 找到合适的位置添加星标
        const messageHeader = message.querySelector(".flex.items-center") || message;
        messageHeader.appendChild(starButton);
      } else {
        // 更新现有星标按钮的可见性
        const starButton = message.querySelector(".star-button");
        starButton.style.display = visible ? "inline-block" : "none";

        // 如果已经是书签，确保显示金色星星
        const isBookmarked = checkIfBookmarked(message.id);
        if (isBookmarked) {
          starButton.querySelector('.star-icon.grey').style.display = "none";
          starButton.querySelector('.star-icon.gold').style.display = "inline-block";
        }
      }
    });
  }

  // 添加辅助函数检查消息是否已被标记为书签
  function checkIfBookmarked(messageId) {
    if (!currentConversationId || !bookmarks[currentConversationId]) return false;
    return bookmarks[currentConversationId].some(bookmark => bookmark.id === messageId);
  }

  // 修改addBookmark函数以处理已添加的书签
  function addBookmark(message) {
    if (!currentConversationId) {
      currentConversationId = getCurrentConversationId();
      if (!currentConversationId) {
        console.error("Could not determine conversation ID");
        return;
      }

      if (!bookmarks[currentConversationId]) {
        bookmarks[currentConversationId] = [];
      }
    }

    const messageId = message.id;

    // 检查是否已经添加过这个书签
    const exists = bookmarks[currentConversationId].some(b => b.id === messageId);
    if (exists) {
      // 已经是书签，可以选择显示提示或者不做任何操作
      showNotification("Already bookmarked", "info");
      return;
    }

    const role = message.getAttribute("data-message-author-role");
    const type = role === "user" ? "Question" : "Answer";
    const content = message.innerText.replace("⭐", "").trim();
    const shortContent = content.length > 30 ? content.substring(0, 30) + "..." : content;

    // 创建书签对象
    const bookmark = {
      id: messageId,
      name: `${type}: ${shortContent}`,
      content: content,
      timestamp: new Date().toISOString()
    };

    // 添加到书签数组
    bookmarks[currentConversationId].push(bookmark);
    addBookmarkToDrawer(bookmark);
    saveBookmarks();

    // 显示成功添加书签的通知
    showNotification("Bookmark added", "success");
  }

  // Add star buttons to any new messages that don't have them yet
  function addStarButtonsToNewMessages() {
    const messages = document.querySelectorAll("[data-message-author-role]");

    messages.forEach((message) => {
      if (!message.querySelector(".star-button")) {
        // This is a new message, add star button
        if (!message.id) {
          const role = message.getAttribute("data-message-author-role");
          const type = role === "user" ? "question" : "answer";
          const existingElements = document.querySelectorAll(`[id^="${type}-"]`);
          const counter = existingElements.length + 1;
          message.id = `${type}-${counter}`;
        }

        const starButton = document.createElement("button");
        starButton.innerHTML = "⭐";
        starButton.className = "star-button";
        starButton.style.marginLeft = "10px";
        starButton.style.cursor = "pointer";
        starButton.style.display = starsVisible ? "inline-block" : "none";
        starButton.style.border = "none";
        starButton.style.background = "transparent";
        starButton.style.fontSize = "16px";
        starButton.style.transition = "transform 0.2s";
        starButton.title = "Add bookmark";
        starButton.dataset.messageId = message.id;

        starButton.addEventListener("mouseenter", () => {
          starButton.style.transform = "scale(1.2)";
        });

        starButton.addEventListener("mouseleave", () => {
          starButton.style.transform = "scale(1)";
        });

        starButton.addEventListener("click", () => {
          addBookmark(message);
        });

        const messageHeader = message.querySelector(".flex.items-center") || message;
        messageHeader.appendChild(starButton);
      }
    });
  }

  // Handle keyboard shortcuts
  function handleKeyboardShortcuts(e) {
    // Alt+B to toggle bookmark stars
    if (e.altKey && e.key === 'b') {
      starsVisible = !starsVisible;
      toggleStarsVisibility(starsVisible);

      const bookmarkButtonContainer = document.getElementById("bookmark-button-container");
      if (bookmarkButtonContainer) {
        bookmarkButtonContainer.style.backgroundColor = starsVisible ? "#FFC107" : "#4CAF50";
      }

      e.preventDefault();
    }

    // Alt+D to toggle bookmark drawer
    if (e.altKey && e.key === 'd') {
      const drawer = document.getElementById("bookmark-drawer");
      if (drawer) {
        drawer.style.right = drawer.style.right === "0px" ? "-350px" : "0px";
        e.preventDefault();
      }
    }
  }

})();