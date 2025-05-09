// 在 background.js 的顶部添加以下日志以便调试
console.log('Background script initialized');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  if (request.action === "getAuthToken") {
    console.log('Processing getAuthToken request');

    chrome.identity.getAuthToken({ 
      interactive: true,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/userinfo.email"
      ]
    }, function(token) {
      console.log('Auth callback received', token ? 'with token' : 'without token');
      
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error('Auth error:', lastError);
        sendResponse({ error: lastError.message });
        return;
      }

      if (!token) {
        console.error('No token received');
        sendResponse({ error: 'Authentication failed. Please make sure you are signed into Chrome with your Google account.' });
        return;
      }

      console.log('Token obtained successfully');
      sendResponse({ token: token });
    });
    
    return true; // 保持通道开放以便异步响应
  }

  if (request.action === "revokeToken") {
    if (authToken) {
      chrome.identity.removeCachedAuthToken({ token: authToken }, () => {
        fetch(`https://accounts.google.com/o/oauth2/revoke?token=${authToken}`)
          .then(() => {
            authToken = null;
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error('Token revocation error:', error);
            sendResponse({ error: error.message });
          });
      });
      return true;
    }
    sendResponse({ success: false, error: 'No token to revoke' });
    return false;
  }
});

// Handle installation/update
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated');
});