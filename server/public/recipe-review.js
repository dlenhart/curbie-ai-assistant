(function () {
  const confirmationByAction = {
    discard: 'Discard this recipe? Its photos move to the discarded folder.',
    delete: 'Delete this recipe? Its photos move to the discarded folder.',
  };

  Object.keys(confirmationByAction).forEach(function (action) {
    const button = document.querySelector('button[formaction$="/' + action + '"]');
    if (!button) return;
    button.addEventListener('click', function (event) {
      if (!window.confirm(confirmationByAction[action])) event.preventDefault();
    });
  });
})();
