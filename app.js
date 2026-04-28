import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// --- 1. CONFIG ---
const SUPABASE_URL = 'https://zphmbedascwcoddrserg.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwaG1iZWRhc2N3Y29kZHJzZXJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNTQ3NTIsImV4cCI6MjA5MjgzMDc1Mn0.MnnGK-V4vRC8Y_ILWlUiLNkMppWDi53S9RBUpKR2amE'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

let currentBoxId = null
let currentUser = null 

// --- 2. AUTH LOGIC ---

/**
 * セッションの有効性を確認し、UIを更新する
 */
// --- 2. AUTH LOGIC (修正版) ---
async function checkNexAuth() {
    const token = localStorage.getItem('nex_token');
    
    // トークンがない？ → それでもOK！アプリはそのまま動かす。
    if (!token) {
        setupGuestUI(); // ゲスト用の表示に整える
        init(); // 認証なしで中身を読み込む
        return;
    }

    // トークンがある場合は、今まで通り有効性をチェック
    const { data: session } = await supabase
        .from('nex_sessions')
        .select('*, nex_users(*)')
        .eq('token', token)
        .maybeSingle();

    if (session && new Date(session.expires_at) > new Date()) {
        currentUser = session.nex_users;
        setupUserUI(); // ログイン済みの表示
        init();
    } else {
        localStorage.removeItem('nex_token');
        setupGuestUI();
        init();
    }
}

// ゲスト（未ログイン）用のUI調整
function setupGuestUI() {
    const overlay = document.getElementById('auth-overlay');
    const authNav = document.getElementById('auth-nav');
    const userProfile = document.getElementById('user-profile');

    if (overlay) overlay.classList.add('hidden'); // 勝手に隠しておく
    if (authNav) authNav.classList.remove('hidden');
    if (userProfile) userProfile.classList.add('hidden');
}
    // 2. DB側のセッションテーブルを照合
    const { data: session, error } = await supabase
        .from('nex_sessions')
        .select('*, nex_users(*)')
        .eq('token', token)
        .maybeSingle();

    // セッション無効またはエラー
    if (error || !session || new Date(session.expires_at) < new Date()) {
        localStorage.removeItem('nex_token');
        if (authOverlay) authOverlay.classList.remove('hidden');
        if (status) status.innerText = 'AUTH_REQUIRED';
        return;
    }

    // 3. 認証成功
    currentUser = session.nex_users;

    // UI更新
    if (authOverlay) authOverlay.classList.add('hidden');
    if (authNav) authNav.classList.add('hidden');
    if (userProfile) userProfile.classList.remove('hidden');
    if (userDisplay) userDisplay.innerText = currentUser.display_name;
    
    if (status) {
        status.innerText = 'ACTIVE_LINK';
        status.classList.replace('text-zinc-600', 'text-emerald-500');
    }

    // アプリ本体の初期化
    init();

/**
 * ログアウト処理
 */
function handleLogout() {
    localStorage.removeItem('nex_token');
    window.location.reload();
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
        <article class="border-l border-zinc-800 pl-4 py-1 animate-in fade-in slide-in-from-left-1">
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
    const input = document.getElementById('message-input')
    if (!input.value.trim() || !currentBoxId || !currentUser) return

    const { error } = await supabase.from('messages').insert({
        content: input.value,
        box_id: currentBoxId,
        sender: currentUser.display_name,
        sender_icon: currentUser.sender_icon
    })

    if (!error) {
        input.value = ''
        input.style.height = 'auto'
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

async function init() {
    const { data: boxes } = await supabase.from('boxes').select('*')
    const boxList = document.getElementById('box-list')

    if (boxes && boxes.length > 0) {
        boxList.innerHTML = boxes.map(box => `
            <li class="cursor-pointer p-2 text-xs hover:bg-zinc-900 rounded transition" data-id="${box.id}">
                # ${box.title}
            </li>
        `).join('')

        currentBoxId = boxes[0].id
        document.getElementById('current-title').innerText = boxes[0].title
        loadMessages(currentBoxId)
        subscribe(currentBoxId)

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

// --- 4. RUN ---
document.addEventListener('DOMContentLoaded', () => {
    checkNexAuth();

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
})