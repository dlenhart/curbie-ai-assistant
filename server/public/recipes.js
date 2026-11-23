(function () {
  const filterInput = document.getElementById('recipe-filter');
  const approvedList = document.getElementById('approved-recipes');
  if (!filterInput || !approvedList) return;

  filterInput.addEventListener('input', function () {
    const filterText = filterInput.value.trim().toLowerCase();
    approvedList.querySelectorAll('li').forEach(function (item) {
      item.hidden = !item.textContent.toLowerCase().includes(filterText);
    });
  });
})();
