import React, { useState, useEffect } from "react";

function App() {
  const [bookmarks, setBookmarks] = useState([]);

  useEffect(() => {
    // Ensure the chrome API is available before using it
    if (window.chrome && chrome.storage) {
      chrome.storage.sync.get("bookmarks", (result) => {
        setBookmarks(result.bookmarks || []);
      });
    }
  }, []);

  return (
    <div>
      <h1>Bookmarks</h1>
      <ul>
        {bookmarks.map((bookmark, index) => (
          <li key={index}>{bookmark}</li>
        ))}
      </ul>
    </div>
  );
}

export default App;
