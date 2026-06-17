// In-page sidebar overlay: connection/sync status, participant list, chat log,
// chat input, and a quick-emoji bar. Pure DOM; the orchestrator wires callbacks.

(function (root) {
  'use strict';

  const QUICK_EMOJIS = ['😂', '😍', '🔥', '👏', '😮', '😢', '❤️', '👍', '👎', '🎉', '💀', '🙌'];

  function createOverlay({ onSendChat }) {
    const host = document.createElement('div');
    host.id = 'wp-overlay';
    host.innerHTML = `
      <div class="wp-header">
        <span class="wp-title">Watch Party</span>
        <span class="wp-status" id="wp-status">connecting…</span>
        <button class="wp-collapse" id="wp-collapse" title="Collapse">–</button>
      </div>
      <div class="wp-body">
        <div class="wp-section wp-people">
          <div class="wp-section-title">In the party (<span id="wp-count">0</span>)</div>
          <ul id="wp-participants"></ul>
        </div>
        <div class="wp-section wp-chat">
          <div class="wp-section-title">Chat</div>
          <div class="wp-chatlog" id="wp-chatlog"></div>
          <div class="wp-emojibar" id="wp-emojibar"></div>
          <form class="wp-chatform" id="wp-chatform">
            <input id="wp-chatinput" type="text" placeholder="Say something…" autocomplete="off" maxlength="500" />
            <button type="submit">Send</button>
          </form>
        </div>
      </div>
    `;

    const statusEl = host.querySelector('#wp-status');
    const countEl = host.querySelector('#wp-count');
    const participantsEl = host.querySelector('#wp-participants');
    const chatlogEl = host.querySelector('#wp-chatlog');
    const inputEl = host.querySelector('#wp-chatinput');
    const formEl = host.querySelector('#wp-chatform');
    const emojibar = host.querySelector('#wp-emojibar');
    const collapseBtn = host.querySelector('#wp-collapse');

    QUICK_EMOJIS.forEach((e) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wp-emoji';
      b.textContent = e;
      b.addEventListener('click', () => {
        // Click an emoji = send it immediately as its own message.
        onSendChat(e);
      });
      emojibar.appendChild(b);
    });

    formEl.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const text = inputEl.value.trim();
      if (!text) return;
      onSendChat(text);
      inputEl.value = '';
    });

    collapseBtn.addEventListener('click', () => {
      host.classList.toggle('wp-collapsed');
      collapseBtn.textContent = host.classList.contains('wp-collapsed') ? '+' : '–';
    });

    // --- public API ------------------------------------------------------

    function setStatus(text, state) {
      statusEl.textContent = text;
      statusEl.dataset.state = state || '';
    }

    function setParticipants(list, selfId) {
      countEl.textContent = String(list.length);
      participantsEl.innerHTML = '';
      list.forEach((p) => {
        const li = document.createElement('li');
        const name = p.name + (p.clientId === selfId ? ' (you)' : '');
        li.textContent = name;
        if (p.isHost) {
          const tag = document.createElement('span');
          tag.className = 'wp-hosttag';
          tag.textContent = 'host';
          li.appendChild(tag);
        }
        participantsEl.appendChild(li);
      });
    }

    function addChat({ name, text, self, system }) {
      const row = document.createElement('div');
      row.className = 'wp-msg' + (self ? ' wp-self' : '') + (system ? ' wp-system' : '');
      if (system) {
        row.textContent = text;
      } else {
        const who = document.createElement('span');
        who.className = 'wp-who';
        who.textContent = name + ': ';
        const body = document.createElement('span');
        body.textContent = text;
        row.appendChild(who);
        row.appendChild(body);
      }
      chatlogEl.appendChild(row);
      chatlogEl.scrollTop = chatlogEl.scrollHeight;
    }

    function mount() {
      if (!document.getElementById('wp-overlay')) {
        document.body.appendChild(host);
      }
    }

    function unmount() {
      host.remove();
    }

    return { mount, unmount, setStatus, setParticipants, addChat };
  }

  root.WP = root.WP || {};
  root.WP.createOverlay = createOverlay;
})(typeof window !== 'undefined' ? window : globalThis);
