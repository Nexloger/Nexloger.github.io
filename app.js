import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// --- 1. CONFIG ---
const SUPABASE_URL = 'https://zphmbedascwcoddrserg.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwaG1iZWRhc2N3Y29kZHJzZXJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNTQ3NTIsImV4cCI6MjA5MjgzMDc1Mn0.MnnGK-V4vRC8Y_ILWlUiLNkMppWDi53S9RBUpKR2amE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

let currentBoxId = null
let currentUser = null 

// --- 2. ELEMENTS ---
const postModal = document.getElementById('post-modal');
const openModalBtn = document.getElementById('open-post-modal');
const closeModalBtn = document.getElementById('close-post-modal');
const modalTransmitBtn = document.getElementById('modal-transmit-btn');
const modalContent = document.getElementById('modal-content');
const modalSectorName = document.getElementById('modal-sector-name');
const modalImageInput = document.getElementById('modal-image-input');
const imagePreview = document.getElementById('image-preview');
const fileStatus = document.getElementById('file-status');

// --- 3. FUNCTIONS ---

// ログインチェック
async function checkAuth() {
    const token = localStorage.getItem('nex_token');
    if (!token) return;

    const { data: session } = await supabase
        .from('nex_sessions')
        .select('*, nex_users(*)')
        .eq('token', token)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

    if (session && session.nex_users) {
        currentUser = session.nex_users;
        document.getElementById('auth-nav').classList.add('hidden');
        document.getElementById('user-profile').classList.remove('hidden');
        document.getElementById('user-display').innerText = currentUser.display_name;
        console.log("AUTH_LOADED:", currentUser.display_name);
    }
}

// メッセージ読み込み
async function loadMessages(boxId) {
    const feed = document.getElementById('feed');
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('box_id', boxId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error("LOAD_ERROR:", error);
        return;
    }

    feed.innerHTML = data.map(msg => `
        <a href="posts.html?id=${msg.id}" class="block group">
            <article class="border-l-2 border-emerald-500/20 pl-4 py-3 hover:border-emerald-500/60 hover:bg-white/2 transition-all rounded-r-2xl">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] font-bold text-emerald-500 uppercase mono tracking-tighter">${msg.sender}</span>
                        <span class="text-[8px] text-zinc-600 mono">${new Date(msg.created_at).toLocaleTimeString()}</span>
                    </div>
                    <span class="text-[10px] text-zinc-700 group-hover:text-emerald-500 transition-colors mono">VIEW_LOG →</span>
                </div>
                <p class="text-sm text-zinc-300 leading-relaxed">${msg.content}</p>
                ${msg.image_url ? `
                    <div class="mt-3 rounded-xl overflow-hidden border border-white/5 max-w-sm group-hover:border-emerald-500/30 transition-all">
                        <img src="${msg.image_url}" class="w-full h-auto object-cover opacity-80 group-hover:opacity-100 transition-opacity">
                    </div>
                ` : ''}
            </article>
        </a>
    `).join('');
    feed.scrollTop = feed.scrollHeight;
}

// セクター初期化
async function init() {
    const { data: boxes } = await supabase.from('boxes').select('*');
    if (boxes && boxes.length > 0) {
        const list = document.getElementById('box-list');
        list.innerHTML = boxes.map(b => `
            <li class="cursor-pointer p-3 text-[11px] hover:bg-white/5 rounded-xl transition-all mono uppercase tracking-widest text-zinc-500 hover:text-white" data-id="${b.id}">
                # ${b.title}
            </li>
        `).join('');
        
        currentBoxId = boxes[0].id;
        document.getElementById('current-title').innerText = boxes[0].title;
        loadMessages(currentBoxId);
        
        list.querySelectorAll('li').forEach(li => {
            li.onclick = () => {
                currentBoxId = li.dataset.id;
                document.getElementById('current-title').innerText = li.innerText;
                loadMessages(currentBoxId);
            };
        });
    }
}

function resetForm() {
    modalContent.value = '';
    modalImageInput.value = '';
    imagePreview.classList.add('hidden');
    fileStatus.innerText = 'Attach_Media_Payload';
}

// --- 4. EVENT LISTENERS ---

// DOM読み込み完了時に実行
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth(); // 1. ログイン確認
    await init();      // 2. データ初期化

    // モーダルを開く
    if (openModalBtn) {
        openModalBtn.onclick = () => {
            if (!currentUser) {
                document.getElementById('auth-overlay').classList.remove('hidden');
                return;
            }
            modalSectorName.innerText = document.getElementById('current-title').innerText;
            postModal.classList.remove('hidden');
        };
    }

    // モーダルを閉じる
    if (closeModalBtn) {
        closeModalBtn.onclick = () => {
            postModal.classList.add('hidden');
            resetForm();
        };
    }

    // 画像プレビュー
    if (modalImageInput) {
        modalImageInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                fileStatus.innerText = `READY: ${file.name}`;
                const reader = new FileReader();
                reader.onload = (re) => {
                    imagePreview.querySelector('img').src = re.target.result;
                    imagePreview.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        };
    }

    // 送信処理
    if (modalTransmitBtn) {
        modalTransmitBtn.onclick = async () => {
            const content = modalContent.value.trim();
            const file = modalImageInput.files[0];
            
            if (!content || !currentBoxId || !currentUser) {
                alert("SYSTEM_ERROR: 入力が不完全です。");
                return;
            }

            modalTransmitBtn.innerText = 'TRANSMITTING...';
            modalTransmitBtn.disabled = true;

            let imageUrl = null;

            try {
                // A. 画像アップロード
                if (file) {
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
                    const filePath = `public/${fileName}`;

                    const { error: uploadError } = await supabase.storage
                        .from('log-images')
                        .upload(filePath, file);

                    if (uploadError) throw uploadError;

                    const { data } = supabase.storage.from('log-images').getPublicUrl(filePath);
                    imageUrl = data.publicUrl;
                }

                // B. DB挿入
                const { error: dbError } = await supabase.from('messages').insert({
                    content: content,
                    box_id: currentBoxId,
                    sender: currentUser.display_name,
                    image_url: imageUrl
                });

                if (dbError) {
                    if (dbError.message.includes('RATE_LIMIT_EXCEEDED')) {
                        throw new Error("連投制限です。1分待機してください。");
                    }
                    throw dbError;
                }

                // C. 完了処理
                postModal.classList.add('hidden');
                resetForm();
                loadMessages(currentBoxId); // フィードを更新

            } catch (err) {
                alert(`CRITICAL_ERROR: ${err.message}`);
            } finally {
                modalTransmitBtn.innerText = 'Transmit_Data_Stream';
                modalTransmitBtn.disabled = false;
            }
        };
    }
});