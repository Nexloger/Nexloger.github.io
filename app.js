import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// --- 1. CONFIG ---
const SUPABASE_URL = 'https://zphmbedascwcoddrserg.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwaG1iZWRhc2N3Y29kZHJzZXJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNTQ3NTIsImV4cCI6MjA5MjgzMDc1Mn0.MnnGK-V4vRC8Y_ILWlUiLNkMppWDi53S9RBUpKR2amE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

let currentBoxId = null
let currentUser = null 

// --- 2. AUTH LOGIC ---

async function checkAuthAndInit() {
    const token = localStorage.getItem('nex_token');
    const authNav = document.getElementById('auth-nav');
    const userProfile = document.getElementById('user-profile');
    const userDisplay = document.getElementById('user-display');
    const statusTag = document.getElementById('status');

    if (!token) {
        setupGuestUI();
        return;
    }

    // セッションをDBで照合（ユーザー情報も一緒に取得）
    const { data: session, error } = await supabase
        .from('nex_sessions')
        .select('*, nex_users(*)')
        .eq('token', token)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

    if (session && session.nex_users) {
        // 認証成功
        currentUser = session.nex_users;
        
        if (authNav) authNav.classList.add('hidden');
        if (userProfile) userProfile.classList.remove('hidden');
        if (userDisplay) userDisplay.innerText = currentUser.display_name;
        if (statusTag) {
            statusTag.innerText = 'ACTIVE_LINK';
            statusTag.className = "mono text-[9px] py-1 px-3 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-500 uppercase tracking-widest font-bold";
        }
        console.log(`Access_Granted: Welcome, ${currentUser.display_name}`);
    } else {
        // セッション無効
        localStorage.removeItem('nex_token');
        setupGuestUI();
    }

    // どちらの状態でもアプリ（メッセージ読み込み等）を起動
    init();
}

function setupGuestUI() {
    const authNav = document.getElementById('auth-nav');
    const userProfile = document.getElementById('user-profile');
    const statusTag = document.getElementById('status');
    const overlay = document.getElementById('auth-overlay');

    if (authNav) authNav.classList.remove('hidden');
    if (userProfile) userProfile.classList.add('hidden');
    if (statusTag) statusTag.innerText = 'GUEST_MODE';
    
    // ゲストでも中身は見れるようにオーバーレイを隠す（必要なら）
    if (overlay) overlay.classList.add('hidden'); 
    
    console.log("Status: Guest_Mode");
    init();
}

async function handleLogout() {
    const token = localStorage.getItem('nex_token');
    if (token) {
        await supabase.from('nex_sessions').delete().eq('token', token);
    }
    localStorage.removeItem('nex_token');
    location.reload();
}

// --- 3. APP LOGIC ---

async function loadMessages(boxId) {
    const feed = document.getElementById('feed')
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('box_id', boxId)
        .order('created_at', { ascending: true })

    if (error) return console.error(error)

    feed.innerHTML = data.map(msg => `
        <article class="border-l border-zinc-800 pl-4 py-1">
            <div class="flex items-center gap-2 mb-1">
                <span class="text-[10px] font-bold text-zinc-500 uppercase">${msg.sender || 'ANON'}</span>
                <span class="text-[9px] text-zinc-700">${new Date(msg.created_at).toLocaleTimeString()}</span>
            </div>
            <p class="text-sm text-zinc-300">${msg.content}</p>
        </article>
    `).join('')
    feed.scrollTop = feed.scrollHeight
}

async function sendLog() {
    const input = document.getElementById('message-input');
    const overlay = document.getElementById('auth-overlay');

    // ログインしていない場合は送信させずにゲートを表示
    if (!currentUser) {
        if (overlay) overlay.classList.remove('hidden');
        return;
    }

    if (!input.value.trim() || !currentBoxId) return;

    const { error } = await supabase.from('messages').insert({
        content: input.value,
        box_id: currentBoxId,
        sender: currentUser.display_name
    });

    if (!error) {
        input.value = '';
    } else {
        console.error("Transmission_Error:", error);
    }
}

function subscribe(boxId) {
    supabase.removeAllChannels()
    supabase.channel('logs')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages', 
            filter: `box_id=eq.${boxId}` 
        }, () => loadMessages(boxId))
        .subscribe()
}

// --- Modal Logic ---
const postModal = document.getElementById('post-modal');
const openModalBtn = document.getElementById('open-post-modal');
const closeModalBtn = document.getElementById('close-post-modal');
const modalTransmitBtn = document.getElementById('modal-transmit-btn');
const modalSectorName = document.getElementById('modal-sector-name');
const modalContent = document.getElementById('modal-content');

// 開く
openModalBtn.onclick = () => {
    if (!currentUser) {
        document.getElementById('auth-overlay').classList.remove('hidden');
        return;
    }
    // 現在選択中のセクター名を表示
    modalSectorName.innerText = document.getElementById('current-title').innerText;
    postModal.classList.remove('hidden');
    modalContent.focus();
};

// 閉じる
closeModalBtn.onclick = () => postModal.classList.add('hidden');

// モーダル内からの送信
modalTransmitBtn.onclick = async () => {
    const content = modalContent.value.trim();
    if (!content || !currentBoxId || !currentUser) return;

    modalTransmitBtn.innerText = 'TRANSMITTING...';
    modalTransmitBtn.disabled = true;

    const { error } = await supabase.from('messages').insert({
        content: content,
        box_id: currentBoxId,
        sender: currentUser.display_name
    });

    if (!error) {
        modalContent.value = '';
        postModal.classList.add('hidden');
    } else {
        alert("送信失敗: " + error.message);
    }

    modalTransmitBtn.innerText = 'TRANSMIT_LOG';
    modalTransmitBtn.disabled = false;
};

async function init() {
    const { data: boxes } = await supabase.from('boxes').select('*')
    const boxList = document.getElementById('box-list')

    if (boxes && boxes.length > 0) {
        boxList.innerHTML = boxes.map(box => `
            <li class="cursor-pointer p-2 text-xs hover:bg-zinc-900 rounded transition" data-id="${box.id}">
                # ${box.title}
            </li>
        `).join('')

        if (!currentBoxId) {
            currentBoxId = boxes[0].id
            document.getElementById('current-title').innerText = boxes[0].title
            loadMessages(currentBoxId)
            subscribe(currentBoxId)
        }

        boxList.querySelectorAll('li').forEach(el => {
            el.onclick = () => {
                currentBoxId = el.dataset.id
                document.getElementById('current-title').innerText = el.innerText
                loadMessages(currentBoxId)
                subscribe(currentBoxId)
            }
        })
    }
}

// --- 4. EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    checkAuthAndInit();

    const sendBtn = document.getElementById('send-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const msgInput = document.getElementById('message-input');

    if (sendBtn) sendBtn.onclick = sendLog;
    if (logoutBtn) logoutBtn.onclick = handleLogout;
    
    if (msgInput) {
        msgInput.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendLog();
            }
        }
    }
});