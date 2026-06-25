const form = document.getElementById('chatForm');
const promptInput = document.getElementById('promptInput');
const messagesEl = document.getElementById('messages');
const sendButton = document.getElementById('sendButton');
const newChatButton = document.getElementById('newChatButton');
const chatList = document.getElementById('chatList');
const chatTitle = document.getElementById('chatTitle');
const statusPill = document.getElementById('statusPill');
const searchBox = document.getElementById('searchBox');
const template = document.getElementById('messageTemplate');

const defaultBotMessage = 'Hello I Am Your Chatbot Ask Me Some Questions';
const systemMessage = {
  role: 'system',
  content: 'You are RAV, a helpful chat assistant. Keep responses clear and concise.'
};

const chats = {
  'New Chat': []
};

let currentChat = 'New Chat';
let chatCounter = 1;
let chatExpanded = false;

function currentTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function setStatus(text, busy = false) {
  statusPill.textContent = text;
  statusPill.classList.toggle('busy', busy);
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function getCurrentConversation() {
  return chats[currentChat];
}

function addMessage(role, content) {
  getCurrentConversation().push({ role, content, time: currentTime() });
  renderMessages();
}

function showWelcomeMessage() {
  const hasMessages = getCurrentConversation().length > 0;
  if (!hasMessages) {
    addMessage('assistant', defaultBotMessage);
  }
}

function renderMessages() {
  messagesEl.innerHTML = '';

  getCurrentConversation().forEach((entry) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const isUser = entry.role === 'user';

    node.classList.add(isUser ? 'user' : 'assistant');
    node.querySelector('.message-role').textContent = isUser ? 'You' : 'RAV';
    node.querySelector('.message-text').textContent = entry.content;
    node.querySelector('.message-time').textContent = entry.time || '';
    messagesEl.appendChild(node);
  });

  scrollToBottom();
}

function makeUniqueTitle(title) {
  const trimmed = title.trim() || 'Untitled Chat';
  const baseTitle = trimmed.length > 32 ? `${trimmed.slice(0, 32)}...` : trimmed;
  let unique = baseTitle;
  let index = 2;

  while (Object.hasOwn(chats, unique) && unique !== currentChat) {
    unique = `${baseTitle} (${index})`;
    index += 1;
  }

  return unique;
}

function renameChatFromFirstMessage(message) {
  const oldName = currentChat;
  const userMessages = chats[oldName].filter((entry) => entry.role === 'user');

  if (userMessages.length !== 1) {
    return;
  }

  const newName = makeUniqueTitle(message);
  if (newName === oldName) {
    return;
  }

  chats[newName] = chats[oldName];
  delete chats[oldName];
  currentChat = newName;
  chatTitle.textContent = newName;
  renderChatList(searchBox.value);
}

function renderChatList(searchText = '') {
  chatList.innerHTML = '';
  const query = searchText.toLowerCase().trim();

  Object.keys(chats).forEach((chatName) => {
    if (query && !chatName.toLowerCase().includes(query)) {
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `chat-list-button${chatName === currentChat ? ' active' : ''}`;
    button.textContent = chatName;
    button.addEventListener('click', () => loadChat(chatName));
    chatList.appendChild(button);
  });
}

function loadChat(chatName) {
  currentChat = chatName;
  chatTitle.textContent = chatName;
  showWelcomeMessage();
  renderChatList(searchBox.value);
  renderMessages();
}

function createNewChat() {
  chatCounter += 1;
  const name = `New Chat ${chatCounter}`;
  chats[name] = [];
  loadChat(name);
}

function renderTypingIndicator() {
  const typingNode = template.content.firstElementChild.cloneNode(true);
  typingNode.classList.add('typing');
  typingNode.querySelector('.message-role').textContent = 'RAV';
  typingNode.querySelector('.message-text').textContent = 'RAV is typing...';
  typingNode.querySelector('.message-text').classList.add('typing-text');
  typingNode.querySelector('.message-time').textContent = '';
  typingNode.dataset.typing = 'true';
  messagesEl.appendChild(typingNode);
  scrollToBottom();
}

function removeTypingIndicator() {
  const typingNode = messagesEl.querySelector('[data-typing="true"]');
  if (typingNode) {
    typingNode.remove();
  }
}

function activateChatLayout() {
  if (chatExpanded) {
    return;
  }

  chatExpanded = true;
  document.body.classList.add('chat-active');
}

async function sendMessage(text) {
  addMessage('user', text);
  activateChatLayout();
  renameChatFromFirstMessage(text);
  setStatus('Thinking...', true);
  sendButton.disabled = true;
  promptInput.disabled = true;
  renderTypingIndicator();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          systemMessage,
          ...getCurrentConversation().map((entry) => ({
            role: entry.role,
            content: entry.content
          }))
        ]
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'The server returned an error.');
    }

    removeTypingIndicator();
    addMessage('assistant', payload.reply || '(No text returned)');
    setStatus('Online', false);
  } catch (error) {
    removeTypingIndicator();
    addMessage('assistant', `Error: ${error.message}`);
    setStatus('Online', false);
  } finally {
    sendButton.disabled = false;
    promptInput.disabled = false;
    promptInput.focus();
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const text = promptInput.value.trim();
  if (!text) {
    return;
  }

  promptInput.value = '';
  await sendMessage(text);
});

promptInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

searchBox.addEventListener('input', () => {
  renderChatList(searchBox.value);
});

newChatButton.addEventListener('click', () => {
  createNewChat();
  promptInput.focus();
});

chatTitle.textContent = currentChat;
showWelcomeMessage();
renderChatList();
renderMessages();
promptInput.focus();
