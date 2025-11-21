/**
 * LLM Chat App Frontend
 *
 * Handles the chat UI interactions and communication with the backend API.
 */

// DOM elements
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");
const themeToggle = document.getElementById("theme-toggle");

// Chat state
const STORAGE_KEY = "cf_ai_haiku_chat_history";
const THEME_KEY = "cf_ai_haiku_theme";

// Load persisted chat history if available, otherwise use default welcome
let chatHistory = (function () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Could not load chat history from localStorage:", e);
  }

  return [
    {
      role: "assistant",
      content:
        "### Hello there! I'm an LLM Haiku poet, here to give you a hand with your writing.\nIf you write a haiku, I'll help you refine it or suggest improvements. Let's create some beautiful poetry together!",
    },
  ];
})();
let isProcessing = false;

/** Theme handling **************************************************/
function applyTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark");
    if (themeToggle) themeToggle.textContent = "🌞";
  } else {
    document.body.classList.remove("dark");
    if (themeToggle) themeToggle.textContent = "🌙";
  }
}

function initTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY) || "light";
    applyTheme(saved);
  } catch (e) {
    applyTheme("light");
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const isDark = document.body.classList.contains("dark");
      const next = isDark ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        /* ignore */
      }
    });
  }
}
/** End theme handling **************************************************/

// Auto-resize textarea as user types
userInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = this.scrollHeight + "px";
});

// Send message on Enter (without Shift)
userInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Send button click handler
sendButton.addEventListener("click", sendMessage);

/**
 * Sends a message to the chat API and processes the response
 */
async function sendMessage() {
  const message = userInput.value.trim();

  // Don't send empty messages
  if (message === "" || isProcessing) return;

  // Disable input while processing
  isProcessing = true;
  userInput.disabled = true;
  sendButton.disabled = true;

  // Add user message to chat
  addMessageToChat("user", message);

  // Clear input
  userInput.value = "";
  userInput.style.height = "auto";

  // Show typing indicator
  typingIndicator.classList.add("visible");

  // Add message to history
  chatHistory.push({ role: "user", content: message });
  saveChatHistory();

  try {
    // Create new assistant response element
    const assistantMessageEl = document.createElement("div");
    assistantMessageEl.className = "message assistant-message";
    assistantMessageEl.innerHTML = "<p></p>";
    chatMessages.appendChild(assistantMessageEl);

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Send request to API
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: chatHistory,
      }),
    });

    // Handle errors
    if (!response.ok) {
      throw new Error("Failed to get response");
    }

    // Process streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let responseText = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Decode chunk
      const chunk = decoder.decode(value, { stream: true });

      // Process SSE format
      const lines = chunk.split("\n");
      for (const line of lines) {
        try {
          const jsonData = JSON.parse(line);
          if (jsonData.response) {
            // Append new content to existing text
            responseText += jsonData.response;

            // Render markdown safely using marked + DOMPurify
            try {
              assistantMessageEl.querySelector("p").innerHTML = DOMPurify.sanitize(
                marked.parse(responseText),
              );
            } catch (e) {
              // Fallback to text if parser isn't available or fails
              assistantMessageEl.querySelector("p").textContent = responseText;
            }

            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
        } catch (e) {
          console.error("Error parsing JSON:", e);
        }
      }
    }

    // Add completed response to chat history
    chatHistory.push({ role: "assistant", content: responseText });
    saveChatHistory();
  } catch (error) {
    console.error("Error:", error);
    const errMsg = "Sorry, there was an error processing your request.";
    addMessageToChat("assistant", errMsg);
    chatHistory.push({ role: "assistant", content: errMsg });
    saveChatHistory();
  } finally {
    // Hide typing indicator
    typingIndicator.classList.remove("visible");

    // Re-enable input
    isProcessing = false;
    userInput.disabled = false;
    sendButton.disabled = false;
    userInput.focus();
  }
}

/**
 * Helper function to add message to chat
 */
function addMessageToChat(role, content) {
  const messageEl = document.createElement("div");
  messageEl.className = `message ${role}-message`;
  const p = document.createElement("p");
  try {
    // Parse markdown and sanitize before inserting as HTML
    p.innerHTML = DOMPurify.sanitize(marked.parse(content));
  } catch (e) {
    // Fallback to plain text
    p.textContent = content;
  }
  messageEl.appendChild(p);
  chatMessages.appendChild(messageEl);

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Persist chat history to localStorage. Safe no-op if storage unavailable.
 */
function saveChatHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chatHistory));
  } catch (e) {
    console.warn("Could not save chat history to localStorage:", e);
  }
}

/**
 * Render the current chatHistory into the UI (clears existing messages).
 */
function renderChatFromHistory() {
  chatMessages.innerHTML = "";
  for (const msg of chatHistory) {
    addMessageToChat(msg.role, msg.content);
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Render persisted or default history on load
// Initialize theme first to avoid flash
initTheme();
renderChatFromHistory();
