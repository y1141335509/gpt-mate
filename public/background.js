// Background script for ChatGPT Bookmark Extension
console.log('Background script initialized');

// Global auth token
let authToken = null;

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  // Handle auth token request
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
      authToken = token; // Store token for later use
      sendResponse({ token: token });
    });
    
    return true; // Keep messaging channel open for async response
  }

  // Handle token revocation
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
      return true; // Keep messaging channel open
    }
    sendResponse({ success: false, error: 'No token to revoke' });
    return false;
  }
  
  // Handle CSV fetching to bypass CORS
  // if (request.action === "fetchCSV") {
  //   console.log('Processing fetchCSV request for URL:', request.url);
    
  //   fetch(request.url)
  //     .then(response => {
  //       if (!response.ok) {
  //         throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  //       }
  //       return response.text();
  //     })
  //     .then(data => {
  //       console.log('CSV data fetched successfully, sending back to content script');
  //       sendResponse({ data: data });
  //     })
  //     .catch(error => {
  //       console.error('CSV fetch error:', error);
  //       sendResponse({ error: error.message });
  //     });
    
  //   return true; // Keep messaging channel open
  // }
});

// Handle installation/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);
  
  // Show first-time install instructions
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' });
  }
  
  // Clear any stored auth tokens when updating
  if (details.reason === 'update') {
    chrome.identity.clearAllCachedAuthTokens(() => {
      console.log('Cleared all cached auth tokens after update');
    });
  }
});

// Add listener for tab updates to refresh content script
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && 
      (tab.url.includes('chat.openai.com') || tab.url.includes('chatgpt.com'))) {
    console.log('ChatGPT page loaded, injecting content script');
    
    // Send message to content script to refresh
    chrome.tabs.sendMessage(tabId, { action: "refreshContentScript" })
      .catch(error => {
        console.log('Content script not yet loaded or error occurred:', error);
      });
  }
});