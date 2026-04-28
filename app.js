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

// --- 3. MODAL LOGIC ---

// モーダルを開く
openModalBtn.onclick = () => {
    if (!currentUser) {
        document.getElementById('auth-overlay').classList.remove('hidden');
        return;
    }
    modalSectorName.innerText = document.getElementById('current-title').innerText;
    postModal.classList.remove('hidden');
};

// モーダルを閉じる
closeModalBtn.onclick = () => {
    postModal.classList.add('hidden');
    resetForm();
};

// プレビュー表示
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

function resetForm() {
    modalContent.value = '';
    modalImageInput.value = '';
    imagePreview.classList.add('hidden');
    fileStatus.innerText = 'Attach_Media_Payload';
}

// --- 4. CORE TRANSMISSION (送信処理) ---

modalTransmitBtn.onclick = async () => {
    const content = modalContent.value.trim();
    const file = modalImageInput.files[0];
    
    if (!content || !currentBoxId || !currentUser) return;

    modalTransmitBtn.innerText = 'TRANSMITTING...';
    modalTransmitBtn.disabled = true;

    let imageUrl = null;

    try {
        // A. 画像がある場合はStorageにアップ
        if (file) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}_${Date.now()}.${fileExt}`;
            const filePath = `public/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('log-images') // 作成したバケット名
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 公開URLの取得
            const { data } = supabase.storage.from('log-images').getPublicUrl(filePath);
            imageUrl = data.publicUrl;
        }

        // B. DBにメッセージを登録
        const { error: dbError } = await supabase.from('messages').insert({
            content: content,
            box_id: currentBoxId,
            sender: currentUser.display_name,
            image_url: imageUrl
        });

        if (dbError) throw dbError;

        // 成功時
        postModal.classList.add('hidden');
        resetForm();

    } catch (err) {
        console.error('Transmission_Error:', err);
        alert(`CRITICAL_ERROR: ${err.message}`);
    } finally {
        modalTransmitBtn.innerText = 'Transmit_Data_Stream';
        modalTransmitBtn.disabled = false;
    }
};

// --- 5. INITIALIZATION & AUTH (既存のものを統合) ---

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
    }
    init();
}


modalTransmitBtn.onclick = async () => {
    const content = modalContent.value.trim();
    const file = modalImageInput.files[0];
    
    // バリデーション：本文がない、または未選択セクターなら中断
    if (!content || !currentBoxId || !currentUser) return;

    // UIを「送信中」状態にロック
    modalTransmitBtn.innerText = 'TRANSMITTING...';
    modalTransmitBtn.disabled = true;

    let imageUrl = null;

    try {
        // STEP 1: 画像がある場合のみ、Supabase Storageにアップロード
        if (file) {
            // ファイル名の衝突を避けるためユニークな名前を生成
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
            const filePath = `public/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('log-images') // 作成したバケット名
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // アップロードしたファイルの公開URLを取得
            const { data } = supabase.storage.from('log-images').getPublicUrl(filePath);
            imageUrl = data.publicUrl;
        }

        // STEP 2: messagesテーブルへ投稿データを挿入
        const { error: dbError } = await supabase.from('messages').insert({
            content: content,
            box_id: currentBoxId,
            sender: currentUser.display_name,
            image_url: imageUrl // 画像がない場合は null が入る
        });

        if (dbError) throw dbError;

        // 成功：モーダルを閉じて入力内容をリセット
        postModal.classList.add('hidden');
        resetForm();

    } catch (err) {
        // 失敗：エラー内容をアラートで表示
        console.error('Transmission_Error:', err);
        alert(`CRITICAL_ERROR: ${err.message}`);
    } finally {
        // UIロックを解除
        modalTransmitBtn.innerText = 'Transmit_Data_Stream';
        modalTransmitBtn.disabled = false;
    }
};

// modalTransmitBtn.onclick の try-catch 内を少し強化
try {
    // ... 画像アップロード処理 ...

    const { error: dbError } = await supabase.from('messages').insert({
        content: content,
        box_id: currentBoxId,
        sender: currentUser.display_name,
        image_url: imageUrl
    });

    if (dbError) {
        // 連投制限エラーの判定
        if (dbError.message.includes('RATE_LIMIT_EXCEEDED')) {
            alert("⚠ SECURITY_ALERT: 連投が検知されました。1分待機してください。");
        } else {
            throw dbError;
        }
        return;
    }

    // ... 成功時の処理 ...
} catch (err) {
    console.error('Transmission_Error:', err);
    alert(`CRITICAL_ERROR: ${err.message}`);
}

async function loadMessages(boxId) {
    const feed = document.getElementById('feed');
    const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('box_id', boxId)
        .order('created_at', { ascending: true });

    if (data) {
        feed.innerHTML = data.map(msg => `
            <article class="border-l border-emerald-500/30 pl-4 py-2 animate-in fade-in slide-in-from-left-2">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-[10px] font-bold text-emerald-500 uppercase mono tracking-tighter">${msg.sender}</span>
                    <span class="text-[8px] text-zinc-600 mono">${new Date(msg.created_at).toLocaleTimeString()}</span>
                </div>
                <p class="text-sm text-zinc-300 leading-relaxed">${msg.content}</p>
                ${msg.image_url ? `
                    <div class="mt-3 rounded-xl overflow-hidden border border-white/5 max-w-sm">
                        <img src="${msg.image_url}" class="w-full h-auto object-cover opacity-80 hover:opacity-100 transition-opacity">
                    </div>
                ` : ''}
            </article>
        `).join('');
        feed.scrollTop = feed.scrollHeight;
    }
}

// ... init(), subscribe() などの既存ロジック ...
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

document.addEventListener('DOMContentLoaded', checkAuth);