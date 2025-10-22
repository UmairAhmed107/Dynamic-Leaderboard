// Player data stored in a Map
let players = new Map();

function addOrUpdatePlayer() {
  const name = document.getElementById("playerName").value.trim();
  const score = parseInt(document.getElementById("playerScore").value);

  if (!name || isNaN(score)) {
    alert("Enter valid name and score!");
    return;
  }

  players.set(name, score);
  updateLeaderboard();
}

function removePlayer() {
  const name = document.getElementById("playerName").value.trim();
  if (players.has(name)) {
    players.delete(name);
    updateLeaderboard();
  } else {
    alert("Player not found!");
  }
}

function showTopK() {
  const k = parseInt(document.getElementById("topK").value);
  if (isNaN(k) || k <= 0) {
    alert("Enter a valid number for Top K");
    return;
  }

  updateLeaderboard(k);
}

// Update leaderboard display
function updateLeaderboard(topK = null) {
  const tableBody = document.querySelector("#leaderboardTable tbody");
  tableBody.innerHTML = "";

  // Sort players by score descending
  const sortedPlayers = [...players.entries()]
    .sort((a, b) => b[1] - a[1]);

  const displayPlayers = topK ? sortedPlayers.slice(0, topK) : sortedPlayers;

  displayPlayers.forEach(([name, score], index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${name}</td>
      <td>${score}</td>
    `;
    tableBody.appendChild(row);
  });
}
