/**
 * @fileoverview TypingManager - Debounced typing indicator management
 * Handles C_TYPING_START and C_TYPING_STOP events with 3-second debounce
 */

const TYPING_DEBOUNCE_MS = 3000;
const TYPING_STOP_DELAY_MS = 5000;

let typingStartTimer = null;
let typingStopTimer = null;

/**
 * Handles typing input from the message field
 * @param {HTMLInputElement|HTMLTextAreaElement} field - The input field element
 * @returns {void}
 */
function handleTypingInput(field) {
  const val = field.value;
  
  if (val.length > 0) {
    // Start typing debounce
    if (!typingStartTimer) {
      wsSend(WS_EV.C_TYPING_START);
    }
    
    // Clear any pending stop timer
    if (typingStopTimer) {
      clearTimeout(typingStopTimer);
      typingStopTimer = null;
    }
    
    // Reset the stop timer
    typingStartTimer = setTimeout(() => {
      typingStartTimer = null;
      // Schedule stop if no more typing
      typingStopTimer = setTimeout(() => {
        wsSend(WS_EV.C_TYPING_STOP);
        typingStopTimer = null;
      }, TYPING_STOP_DELAY_MS);
    }, TYPING_DEBOUNCE_MS);
  } else {
    // Clear typing immediately when field is empty
    clearTypingTimers();
    wsSend(WS_EV.C_TYPING_STOP);
    
    // Remove typing indicator from UI
    const container = document.getElementById('msgs');
    const existing = container?.querySelector('.tyrow');
    if (existing) existing.remove();
  }
}

/**
 * Clears all typing timers
 * @returns {void}
 */
function clearTypingTimers() {
  if (typingStartTimer) {
    clearTimeout(typingStartTimer);
    typingStartTimer = null;
  }
  if (typingStopTimer) {
    clearTimeout(typingStopTimer);
    typingStopTimer = null;
  }
}

/**
 * Stops typing indicator when message is sent
 * @returns {void}
 */
function onMessageSent() {
  clearTypingTimers();
  wsSend(WS_EV.C_TYPING_STOP);
  
  // Remove typing indicator from UI
  const container = document.getElementById('msgs');
  const existing = container?.querySelector('.tyrow');
  if (existing) existing.remove();
}

window.TypingManager = {
  handleTypingInput,
  clearTypingTimers,
  onMessageSent
};