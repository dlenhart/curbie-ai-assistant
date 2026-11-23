(function () {
  'use strict';

  var log = document.getElementById('chat-log');
  var conversationId = log.dataset.conversationId;
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-input');
  var sendButton = document.getElementById('chat-send');
  var status = document.getElementById('chat-status');
  var socket = null;
  var isWaitingForReply = false;

  var CATEGORY_LABELS = {
    cited: 'Sourced',
    dont_know: "Don't know",
    generated: 'Generated',
    conversational: '',
    error: 'Error'
  };

  var RECIPE_LINK_PREFIX = '/recipes/';

  function isRecipeLink(href) {
    return typeof href === 'string' && href.indexOf(RECIPE_LINK_PREFIX) === 0;
  }

  function createCitation(citation) {
    var source = document.createElement('li');
    var label = citation.title + ' (' + citation.skillName + ')';
    if (!isRecipeLink(citation.href)) {
      source.textContent = label;
      return source;
    }
    var link = document.createElement('a');
    link.textContent = label;
    link.href = citation.href;
    source.appendChild(link);
    return source;
  }

  function createCard(card) {
    var container = document.createElement('div');
    container.className = 'chat__card';

    var heading = document.createElement('a');
    heading.className = 'chat__card-heading';
    heading.textContent = card.heading;
    if (isRecipeLink(card.href)) heading.href = card.href;
    container.appendChild(heading);

    var body = document.createElement('pre');
    body.className = 'chat__card-body';
    body.textContent = card.body;
    container.appendChild(body);
    return container;
  }

  function appendEntry(role, text, category, citations, cards) {
    var item = document.createElement('li');
    item.className = 'chat__entry chat__entry--' + role + (category ? ' chat__entry--' + category : '');

    var label = category ? CATEGORY_LABELS[category] : '';
    if (label) {
      var badge = document.createElement('span');
      badge.className = 'chat__badge';
      badge.textContent = label;
      item.appendChild(badge);
    }

    var body = document.createElement('p');
    body.className = 'chat__text';
    body.textContent = text;
    item.appendChild(body);

    if (cards) {
      cards.forEach(function (card) {
        item.appendChild(createCard(card));
      });
    }

    if (citations && citations.length > 0) {
      var sources = document.createElement('ul');
      sources.className = 'chat__sources';
      citations.forEach(function (citation) {
        sources.appendChild(createCitation(citation));
      });
      item.appendChild(sources);
    }

    log.appendChild(item);
    item.scrollIntoView({ block: 'end' });
  }

  function setWaiting(isWaiting) {
    isWaitingForReply = isWaiting;
    sendButton.disabled = isWaiting;
    status.textContent = isWaiting ? 'Curbie is processing…' : '';
  }

  function connect() {
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(protocol + '//' + location.host + '/ws');

    socket.addEventListener('open', function () {
      if (!isWaitingForReply) status.textContent = '';
    });

    socket.addEventListener('message', function (event) {
      var message = JSON.parse(event.data);
      if (message.event === 'assistant_reply') {
        setWaiting(false);
        appendEntry('assistant', message.data.text, message.data.category, message.data.citations, message.data.cards);
      } else if (message.event === 'chat_error') {
        setWaiting(false);
        appendEntry('assistant', message.data.message, 'error', []);
      }
    });

    socket.addEventListener('close', function () {
      if (isWaitingForReply) {
        setWaiting(false);
        appendEntry('assistant', 'Lost the connection to Curbie before a reply arrived.', 'error', []);
      }
      status.textContent = 'Disconnected. Reconnecting…';
      setTimeout(connect, 2000);
    });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (text === '' || isWaitingForReply) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      appendEntry('assistant', 'Not connected to Curbie yet. Try again in a moment.', 'error', []);
      return;
    }
    appendEntry('user', text, null, []);
    socket.send(JSON.stringify({ event: 'user_message', data: { conversationId: conversationId, text: text } }));
    input.value = '';
    setWaiting(true);
  });

  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  connect();
})();
