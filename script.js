let stopRequested = false;

function stopVoting() {
  stopRequested = true;
  document.getElementById('stopBtn').disabled = true;
  appendStatus("\n⏹️ تم طلب إيقاف التصويت...");
}

function appendStatus(text) {
  const status = document.getElementById('status');
  status.innerText += text;
  status.scrollTop = status.scrollHeight;
}

function loadTokensFromFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById("tokens").value = e.target.result;
  };
  reader.readAsText(file);
}

function downloadStatus() {
  const text = document.getElementById("status").innerText;
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'vote_status.html';
  a.click();
}

function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function startMultiVoting() {
  stopRequested = false;
  const channel = document.getElementById("channel").value.trim();
  const tokensRaw = document.getElementById("tokens").value.trim();
  const votePlanRaw = document.getElementById("votePlan").value.trim();
  const status = document.getElementById("status");
  const startBtn = document.getElementById('startBtn');

  if (!channel || !tokensRaw || !votePlanRaw) {
    alert("⚠️ تأكد من ملء جميع الحقول!");
    return;
  }

  const tokens = tokensRaw.split('\n').map(t => t.trim()).filter(Boolean);
  const votePlan = {};

  try {
    votePlanRaw.split(',').forEach(pair => {
      const [indexStr, countStr] = pair.split('=').map(s => s.trim());
      const index = parseInt(indexStr) - 1;
      const count = parseInt(countStr);
      if (isNaN(index) || isNaN(count)) throw new Error();
      votePlan[index] = count;
    });
  } catch {
    alert("⚠️ تنسيق خطة التصويت غير صحيح. استخدم مثل: 1=10,2=5");
    return;
  }

  let poll;
  try {
    const pollRes = await fetch(`https://kick.com/api/v2/channels/${channel}/polls`);
    const pollData = await pollRes.json();
    poll = pollData?.data?.poll;

    if (!poll || !poll.options) {
      appendStatus("❌ لا يوجد استطلاع نشط حالياً.\n");
      return;
    }
  } catch (e) {
    appendStatus("❌ فشل في جلب الاستطلاع.\n");
    return;
  }

  const totalVotes = Object.values(votePlan).reduce((a, b) => a + b, 0);
  if (tokens.length < totalVotes) {
    alert(`⚠️ عدد التوكنات (${tokens.length}) أقل من الأصوات المطلوبة (${totalVotes})`);
    return;
  }

  const voteQueue = [];
  for (const [indexStr, count] of Object.entries(votePlan)) {
    const index = parseInt(indexStr);
    const option = poll.options[index];
    if (!option) {
      alert(`❌ لا يوجد خيار برقم ${index + 1}`);
      return;
    }
    for (let i = 0; i < count; i++) {
      voteQueue.push({ optionId: option.id, label: option.label });
    }
  }

  voteQueue.sort(() => Math.random() - 0.5);

  let remainingTokens = shuffleArray(tokens);
  const tasks = voteQueue.map((vote) => {
    if (remainingTokens.length === 0) remainingTokens = shuffleArray(tokens);
    const token = remainingTokens.pop();
    return { ...vote, token };
  });

  startBtn.disabled = true;
  startBtn.classList.add("loading");
  document.getElementById('stopBtn').disabled = false;
  status.innerText = `🚀 بدء التصويت...\n\n`;

  for (let i = 0; i < tasks.length; i += 10) {
    if (stopRequested) {
      appendStatus("\n⏹️ تم الإيقاف.\n");
      break;
    }

    const group = tasks.slice(i, i + 10);
    appendStatus(`🔄 مجموعة ${Math.floor(i / 3) + 1}:\n`);

    await Promise.all(group.map(async ({ token, optionId, label }, index) => {
      appendStatus(` - توكن ${i + index + 1} → "${label}"... `);
      try {
        const res = await fetch(`https://kick.com/api/v2/channels/${channel}/polls/vote`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ id: optionId })
        });

        const raw = await res.text();
        try {
          const json = JSON.parse(raw);
          if (json?.status?.code === 200) {
            appendStatus("✅\n");
          } else {
            appendStatus(`❌ ${JSON.stringify(json)}\n`);
          }
        } catch {
          appendStatus(`❌ رد غير مفهوم: ${raw}\n`);
        }
      } catch (err) {
        appendStatus(`❌ خطأ: ${err.message}\n`);
      }
    }));

    await new Promise(r => setTimeout(r, 200));
  }

  appendStatus("\n🎯 انتهى التصويت.");
  startBtn.disabled = false;
  startBtn.classList.remove("loading");
  document.getElementById('stopBtn').disabled = true;
}
