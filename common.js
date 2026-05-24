// ================== تكوين Supabase ==================
const SUPABASE_URL = "https://zlkpoghjbqtnhzhmmdbw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_7evDsA5aEgPMsRBTFjntrg_XZQFmNLw";

if (typeof window._supabaseClient === 'undefined') {
    window._supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
var supabase = window._supabaseClient;

// ================== إضافة أنماط الإشعارات (نص ملبس بلونين فقط، بدون برواز) ==================
if (!document.getElementById('ramz-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'ramz-toast-styles';
    style.textContent = `
        #globalToast, .progress-toast {
            background: transparent !important;
            backdrop-filter: none !important;
            border: none !important;
            border-radius: 0 !important;
            color: #10b981 !important;
            font-weight: 700 !important;
            box-shadow: none !important;
            letter-spacing: 0.5px;
            padding: 8px 16px !important;
            display: inline-block !important;
            width: auto !important;
            max-width: 90vw;
            margin: 0 auto;
            text-align: center;
            -webkit-text-stroke: 0.7px black !important;
            text-stroke: 0.7px black !important;
            font-size: 14px;
            text-shadow: none;
        }
        body.light #globalToast, body.light .progress-toast {
            background: transparent !important;
            border: none !important;
            color: #10b981 !important;
            -webkit-text-stroke: 0.7px black !important;
        }
        .progress-toast .progress-bar {
            background: rgba(0, 0, 0, 0.1) !important;
            border-radius: 4px;
            overflow: hidden;
        }
        .progress-toast .progress-fill {
            background: #10b981 !important;
            height: 100%;
        }
        #globalToast.toast-error {
            color: #ff6b6b !important;
            -webkit-text-stroke: 0.7px black !important;
        }
        #globalToast {
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            white-space: nowrap;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.2s;
            pointer-events: none;
        }
        @media (max-width: 640px) {
            #globalToast {
                white-space: normal;
                width: 90%;
                text-align: center;
            }
        }
    `;
    document.head.appendChild(style);
}

// ================== دوال مساعدة ==================
function showToast(msg, isError = false) {
    const toast = document.getElementById('globalToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.opacity = '1';
    if (isError) {
        toast.classList.add('toast-error');
    } else {
        toast.classList.remove('toast-error');
    }
    setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

function formatNumber(num) {
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ================== تحميل البيانات من Supabase ==================
async function loadFromSupabase() {
    try {
        const { data: test, error: testErr } = await supabase.from('users').select('id').limit(1);
        if (testErr) throw testErr;
        
        const { data: posts, error: postsErr } = await supabase
            .from('posts')
            .select('*')
            .eq('hidden', false)
            .order('created_at', { ascending: false });
        if (postsErr) throw postsErr;

        const { data: users, error: usersErr } = await supabase.from('users').select('*');
        if (usersErr) throw usersErr;

        localStorage.setItem('posts', JSON.stringify(posts || []));
        localStorage.setItem('users', JSON.stringify(users || []));
        console.log("✅ تم تحميل البيانات من Supabase");
        return { posts, users };
    } catch (err) {
        console.error("خطأ في loadFromSupabase:", err);
        showToast(`⚠️ فشل تحميل البيانات: ${err.message}`, true);
        return null;
    }
}

async function initDB() {
    try {
        await loadFromSupabase();
        console.log("✅ تمت تهيئة قاعدة البيانات");
        return true;
    } catch (err) {
        console.error("فشل initDB:", err);
        showToast("⚠️ فشل الاتصال بقاعدة البيانات.", true);
        return false;
    }
}

// ================== إنشاء مستخدم ضيف ==================
async function createGuestUser() {
    const guestId = crypto.randomUUID();
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 6);
    const guestUsername = 'زائر_' + Math.floor(Math.random() * 10000);
    const guestUser = {
        id: guestId,
        username: guestUsername,
        full_name: 'زائر',
        bio: 'حساب تجريبي صالح لمدة 6 أشهر. قم بتوثيق حسابك للاستمرار.',
        avatar: 'https://randomuser.me/api/portraits/lego/1.jpg',
        unique_name: 'guest_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        followers_count: 0,
        following_count: 0,
        social: {},
        is_guest: true,
        expiry_date: expiryDate.toISOString(),
        verified: false
    };
    const { error } = await supabase.from('users').insert(guestUser);
    if (error && error.code !== '23505') {
        console.error("فشل إنشاء حساب ضيف:", error);
        showToast("تعذر إنشاء حساب ضيف, حاول مرة أخرى", true);
        return null;
    }
    localStorage.setItem('currentUser', JSON.stringify(guestUser));
    localStorage.setItem('guestUser', JSON.stringify(guestUser));
    showToast("تم إنشاء حساب تجريبي صالح لمدة 6 أشهر");
    return guestUser;
}

async function upgradeGuestToVerified(email, password, fullName) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser || !currentUser.is_guest) {
        showToast("هذه الخاصية متاحة فقط لحسابات الضيوف", true);
        return false;
    }
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            data: {
                full_name: fullName || currentUser.full_name,
                avatar_url: currentUser.avatar
            }
        }
    });
    if (error) {
        showToast(error.message, true);
        return false;
    }
    const { error: updateError } = await supabase
        .from('users')
        .update({
            id: data.user.id,
            username: fullName?.replace(/\s/g, '') || currentUser.username,
            full_name: fullName || currentUser.full_name,
            email: email,
            is_guest: false,
            expiry_date: null,
            verified: true,
            unique_name: email.split('@')[0] + '_' + Math.floor(Math.random() * 1000)
        })
        .eq('id', currentUser.id);
    if (updateError) {
        console.error(updateError);
        showToast("تم إنشاء الحساب لكن حدث خطأ في الترقية", true);
    } else {
        await supabase.from('users').delete().eq('id', currentUser.id);
    }
    localStorage.setItem('currentUser', JSON.stringify({
        id: data.user.id,
        username: fullName?.replace(/\s/g, '') || currentUser.username,
        email: email,
        avatar: currentUser.avatar,
        is_guest: false,
        verified: true
    }));
    localStorage.removeItem('guestUser');
    showToast("🎉 تم توثيق حسابك بنجاح! يمكنك الآن استخدام جميع الميزات.");
    setTimeout(() => window.location.reload(), 1500);
    return true;
}

async function checkGuestValidity(guestUser) {
    if (!guestUser || !guestUser.is_guest) return true;
    if (!guestUser.expiry_date) return true;
    const expiry = new Date(guestUser.expiry_date);
    const now = new Date();
    if (now > expiry) {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('guestUser');
        showToast("انتهت صلاحية حساب التجربة. الرجاء تسجيل الدخول أو إنشاء حساب جديد.", true);
        window.location.href = 'auth.html';
        return false;
    }
    return true;
}

async function syncUserToDatabase(user) {
    if (!user || user.is_guest) return;
    const { data: existing } = await supabase.from('users').select('id').eq('id', user.id).single();
    if (!existing) {
        let baseUsername = user.user_metadata?.full_name || user.email.split('@')[0];
        baseUsername = baseUsername.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '').substring(0, 20);
        const uniqueName = baseUsername + '_' + Math.floor(Math.random() * 10000);
        const avatar = user.user_metadata?.avatar_url || `https://randomuser.me/api/portraits/lego/${Math.floor(Math.random() * 10) + 1}.jpg`;
        await supabase.from('users').insert({
            id: user.id,
            username: baseUsername,
            full_name: user.user_metadata?.full_name || baseUsername,
            bio: 'مرحباً، أنا مستخدم جديد في Ramz-X',
            avatar: avatar,
            unique_name: uniqueName,
            followers_count: 0,
            following_count: 0,
            social: {},
            is_guest: false,
            verified: false
        });
    }
    const { data: finalUser } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (finalUser) localStorage.setItem('currentUser', JSON.stringify(finalUser));
}

async function checkSession() {
    let currentUser = null;
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        try {
            currentUser = JSON.parse(storedUser);
            if (currentUser.is_guest) {
                const isValid = await checkGuestValidity(currentUser);
                if (!isValid) return null;
                if (!currentUser.id || currentUser.id.length < 30) {
                    console.warn("معرف ضيف غير صالح، يتم إنشاء حساب جديد");
                    localStorage.removeItem('currentUser');
                    localStorage.removeItem('guestUser');
                    const newGuest = await createGuestUser();
                    return newGuest;
                }
                return currentUser;
            }
        } catch(e) {}
    }
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error("خطأ في الجلسة:", error);
        return currentUser || null;
    }
    if (session) {
        const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).single();
        let user = profile;
        if (!user) {
            await syncUserToDatabase(session.user);
            const { data: newProfile } = await supabase.from('users').select('*').eq('id', session.user.id).single();
            user = newProfile;
        }
        if (user) {
            localStorage.setItem('currentUser', JSON.stringify(user));
            return user;
        }
    }
    return currentUser || null;
}

// ================== دوال RPC ==================
async function incrementLikes(postId) { try { await supabase.rpc('increment_likes', { row_id: postId }); } catch(e) {} }
async function decrementLikes(postId) { try { await supabase.rpc('decrement_likes', { row_id: postId }); } catch(e) {} }
async function incrementFavorites(postId) { try { await supabase.rpc('increment_favorites', { row_id: postId }); } catch(e) {} }
async function decrementFavorites(postId) { try { await supabase.rpc('decrement_favorites', { row_id: postId }); } catch(e) {} }
async function incrementReposts(postId) { try { await supabase.rpc('increment_reposts', { row_id: postId }); } catch(e) {} }
async function decrementReposts(postId) { try { await supabase.rpc('decrement_reposts', { row_id: postId }); } catch(e) {} }
async function incrementViews(postId) { try { await supabase.rpc('increment_views', { row_id: postId }); } catch(e) {} }
async function incrementCommentsCount(postId) { try { await supabase.rpc('increment_comments_count', { row_id: postId }); } catch(e) {} }
async function incrementCommentLikes(commentId) { try { await supabase.rpc('increment_comment_likes', { comment_id: commentId }); } catch(e) {} }

// ================== التفاعلات ==================
async function toggleLike(postId, btnElement) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) { showToast('يجب تسجيل الدخول', true); return; }
    const isLiked = btnElement.classList.contains('liked');
    if (!isLiked) {
        await supabase.from('likes').insert({ user_id: currentUser.id, post_id: postId });
        await incrementLikes(postId);
        btnElement.classList.add('liked');
        const countSpan = btnElement.querySelector('.count');
        let current = parseInt(countSpan.innerText.replace(/[^0-9]/g, ''));
        countSpan.innerText = formatNumber(current + 1);
        showToast('👍 تم الإعجاب');
    } else {
        await supabase.from('likes').delete().eq('user_id', currentUser.id).eq('post_id', postId);
        await decrementLikes(postId);
        btnElement.classList.remove('liked');
        const countSpan = btnElement.querySelector('.count');
        let current = parseInt(countSpan.innerText.replace(/[^0-9]/g, ''));
        countSpan.innerText = formatNumber(current - 1);
        showToast('👎 تم إلغاء الإعجاب');
    }
}

async function toggleFavorite(postId, btnElement) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) { showToast('يجب تسجيل الدخول', true); return; }
    const isFav = btnElement.classList.contains('favorited');
    if (!isFav) {
        await supabase.from('favorites').insert({ user_id: currentUser.id, post_id: postId });
        await incrementFavorites(postId);
        btnElement.classList.add('favorited');
        btnElement.querySelector('i').className = 'fas fa-star';
        const countSpan = btnElement.querySelector('span:last-child');
        let current = parseInt(countSpan.innerText.replace(/[^0-9]/g, ''));
        countSpan.innerText = formatNumber(current + 1);
        showToast('⭐ أضيف إلى المفضلة');
    } else {
        await supabase.from('favorites').delete().eq('user_id', currentUser.id).eq('post_id', postId);
        await decrementFavorites(postId);
        btnElement.classList.remove('favorited');
        btnElement.querySelector('i').className = 'far fa-star';
        const countSpan = btnElement.querySelector('span:last-child');
        let current = parseInt(countSpan.innerText.replace(/[^0-9]/g, ''));
        countSpan.innerText = formatNumber(current - 1);
        showToast('⭐ تمت إزالة من المفضلة');
    }
}

async function toggleRepost(postId, btnElement) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) { showToast('يجب تسجيل الدخول', true); return; }
    const isReposted = btnElement.classList.contains('reposted');
    if (!isReposted) {
        const { data: original } = await supabase.from('posts').select('*').eq('id', postId).single();
        if (!original) return;
        const newPost = {
            title: original.title,
            content: original.content,
            image: original.image,
            author_id: currentUser.id,
            author_name: currentUser.username,
            likes_count: 0,
            comments_count: 0,
            views_count: 0,
            reposts_count: 0,
            favorites_count: 0,
            edit_count: 0,
            hashtag: original.hashtag,
            category: original.category,
            type: original.type,
            hidden: false,
            created_at: new Date().toISOString()
        };
        await supabase.from('posts').insert(newPost);
        await incrementReposts(postId);
        btnElement.classList.add('reposted');
        const countSpan = btnElement.querySelector('.repost-count');
        let current = parseInt(countSpan.innerText.replace(/[^0-9]/g, ''));
        countSpan.innerText = formatNumber(current + 1);
        showToast('🔁 تمت إعادة النشر');
    } else {
        await decrementReposts(postId);
        btnElement.classList.remove('reposted');
        const countSpan = btnElement.querySelector('.repost-count');
        let current = parseInt(countSpan.innerText.replace(/[^0-9]/g, ''));
        countSpan.innerText = formatNumber(current - 1);
        showToast('↩️ تم إلغاء إعادة النشر');
    }
}

async function toggleFollow(authorId, btnElement) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) { showToast('يجب تسجيل الدخول', true); return; }
    const isFollowing = btnElement.innerText === 'متابَع';
    if (!isFollowing) {
        const { error } = await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: authorId });
        if (error) { showToast(error.message, true); return; }
        btnElement.innerText = 'متابَع';
        btnElement.classList.add('following');
        showToast('✅ تمت متابعة المستخدم');
        await createNotification(authorId, 'follow', currentUser.id, null, null, null, `${currentUser.username} بدأ متابعتك`);
    } else {
        await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', authorId);
        btnElement.innerText = 'متابعة';
        btnElement.classList.remove('following');
        showToast('✅ تم إلغاء المتابعة');
    }
}

// ================== جلب التغذية ==================
async function fetchFeed() {
    const { data: posts, error } = await supabase
        .from('posts')
        .select(`*, users:author_id (id, username, avatar, full_name)`)
        .eq('hidden', false)
        .order('created_at', { ascending: false });
    if (error) {
        console.error("خطأ في جلب التغذية:", error);
        showToast(error.message, true);
        return [];
    }
    return posts.map(p => ({
        id: p.id,
        title: p.title,
        content: p.content,
        image: p.image,
        author_id: p.author_id,
        author_name: p.users?.username || p.author_name,
        author_avatar: p.users?.avatar,
        created_at: p.created_at,
        likes_count: p.likes_count,
        comments_count: p.comments_count,
        views_count: p.views_count,
        reposts_count: p.reposts_count,
        favorites_count: p.favorites_count,
        hashtag: p.hashtag,
        category: p.category,
        type: p.type
    }));
}

async function getUserInteractions(postIds) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser || !postIds.length) return { likes: {}, favorites: {}, reposts: {}, follows: new Set() };
    const { data: likes } = await supabase.from('likes').select('post_id').eq('user_id', currentUser.id).in('post_id', postIds);
    const { data: favs } = await supabase.from('favorites').select('post_id').eq('user_id', currentUser.id).in('post_id', postIds);
    const { data: reps } = await supabase.from('reposts').select('post_id').eq('user_id', currentUser.id).in('post_id', postIds);
    const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', currentUser.id);
    const likesMap = {}; likes?.forEach(l => likesMap[l.post_id] = true);
    const favsMap = {}; favs?.forEach(f => favsMap[f.post_id] = true);
    const repsMap = {}; reps?.forEach(r => repsMap[r.post_id] = true);
    const followsSet = new Set(follows?.map(f => f.following_id) || []);
    return { likes: likesMap, favorites: favsMap, reposts: repsMap, follows: followsSet };
}

async function createPost(postData) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) { showToast('يجب تسجيل الدخول', true); return false; }
    if (!currentUser.id) {
        showToast("خطأ: معرف المستخدم غير موجود. الرجاء تسجيل الخروج ثم الدخول مجدداً.", true);
        return false;
    }
    const newPost = {
        title: postData.title,
        content: postData.content,
        image: postData.image || "https://picsum.photos/id/1/1200/800",
        author_id: currentUser.id,
        author_name: currentUser.username || currentUser.full_name,
        likes_count: 0,
        comments_count: 0,
        views_count: 0,
        reposts_count: 0,
        favorites_count: 0,
        edit_count: 0,
        hashtag: postData.hashtag || '',
        category: postData.category || 'عام',
        type: postData.type || 'article',
        hidden: false,
        created_at: new Date().toISOString()
    };
    const { error } = await supabase.from('posts').insert(newPost);
    if (error) { 
        console.error("خطأ في النشر:", error);
        if (error.message && error.message.includes("duplicate key")) {
            showToast("حدث تعارض في المعرف. حاول مرة أخرى أو أعد تحميل الصفحة.", true);
        } else {
            showToast(error.message, true);
        }
        return false; 
    }
    showToast("🎉 تم نشر المنشور بنجاح!");
    return true;
}

// ================== التعليقات ==================
async function fetchComments(postId) {
    const { data, error } = await supabase
        .from('comments')
        .select('*, users:user_id (username, avatar)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
    if (error) {
        showToast(error.message, true);
        return [];
    }
    return data.map(c => ({ id: c.id, text: c.text, user_id: c.user_id, likes: c.likes || 0, users: c.users, created_at: c.created_at }));
}

async function addComment(postId, text) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) { showToast('يجب تسجيل الدخول', true); return false; }
    const { error } = await supabase.from('comments').insert({ post_id: postId, user_id: currentUser.id, text: text, likes: 0, created_at: new Date().toISOString() });
    if (error) { showToast(error.message, true); return false; }
    await incrementCommentsCount(postId);
    showToast('💬 تم إضافة التعليق');
    return true;
}

async function incrementPostViews(postId) { await incrementViews(postId); }

// ================== دوال الإشعارات المركزية ==================
async function createNotification(userId, type, actorId, postId=null, storyId=null, groupId=null, customMessage=null) {
    const { data: actor } = await supabase.from('users').select('username').eq('id', actorId).single();
    const actorName = actor?.username || 'مستخدم';
    let message = customMessage;
    if (!message) {
        switch(type) {
            case 'like': message = `${actorName} أعجب بمنشورك`; break;
            case 'comment': message = `${actorName} علق على منشورك`; break;
            case 'favorite': message = `${actorName} أضاف منشورك إلى مفضلاته`; break;
            case 'repost': message = `${actorName} أعاد نشر منشورك`; break;
            case 'follow': message = `${actorName} بدأ متابعتك`; break;
            case 'follow_request': message = `${actorName} طلب متابعتك`; break;
            case 'story': message = `${actorName} شارك قصة جديدة`; break;
            case 'new_post': message = `${actorName} نشر منشوراً جديداً`; break;
            case 'profile_update': message = `${actorName} غيّر صورة ملفه الشخصي`; break;
            case 'private_message': message = `${actorName} أرسل لك رسالة جديدة`; break;
            default: message = `${actorName} تفاعل مع محتواك`;
        }
    }
    const { error } = await supabase.from('notifications').insert({
        user_id: userId, type: type, actor_id: actorId, post_id: postId, story_id: storyId, group_id: groupId,
        message: message, is_read: false, created_at: new Date().toISOString()
    });
    if (error) console.error("فشل إنشاء الإشعار:", error);
}

async function fetchNotifications(userId) {
    const { data, error } = await supabase
        .from('notifications')
        .select('*, actor:actor_id (id, username, avatar)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    if (error) return [];
    return data;
}

async function markNotificationAsRead(notifId) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
}

async function getUnreadNotificationsCount(userId) {
    const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);
    if (error) return 0;
    return count;
}

// ================== دوال القصص (Stories) ==================
async function fetchStories() {
    const { data, error } = await supabase
        .from('stories')
        .select('*, users:user_id (id, username, avatar)')
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
    if (error) return [];
    return data;
}

async function createStory(userId, mediaFile, text) {
    let mediaUrl = null;
    if (mediaFile) {
        const ext = mediaFile.name.split('.').pop();
        const fileName = `story_${Date.now()}_${Math.random().toString(36)}.${ext}`;
        const { data, error } = await supabase.storage
            .from('ramz-images')
            .upload(`stories/${fileName}`, mediaFile);
        if (!error) {
            mediaUrl = SUPABASE_URL + "/storage/v1/object/public/ramz-images/stories/" + fileName;
        }
    }
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    const { error } = await supabase.from('stories').insert({
        user_id: userId,
        media_url: mediaUrl,
        text: text || '',
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString()
    });
    if (error) console.error("فشل إنشاء القصة:", error);
    return !error;
}

// ================== دوال المجموعات ==================
async function createGroup(name, creatorId, memberIds) {
    const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({ name: name, created_by: creatorId, created_at: new Date().toISOString() })
        .select()
        .single();
    if (groupError) return null;
    const members = [...new Set([creatorId, ...memberIds])];
    const membersInsert = members.map(uid => ({ group_id: group.id, user_id: uid }));
    const { error: membersError } = await supabase.from('group_members').insert(membersInsert);
    if (membersError) return null;
    return group;
}

async function fetchUserGroups(userId) {
    const { data, error } = await supabase
        .from('group_members')
        .select('groups:group_id (id, name, created_by, created_at)')
        .eq('user_id', userId);
    if (error) return [];
    return data.map(d => d.groups);
}

async function sendGroupMessage(groupId, senderId, text, image=null) {
    const { error } = await supabase.from('group_messages').insert({
        group_id: groupId,
        sender_id: senderId,
        text: text,
        image: image,
        created_at: new Date().toISOString()
    });
    if (!error) {
        const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', groupId);
        if (members) {
            for (let m of members) {
                if (m.user_id !== senderId) {
                    await createNotification(m.user_id, 'group_message', senderId, null, null, groupId, `رسالة جديدة في مجموعة ${groupId}`);
                }
            }
        }
    }
    return !error;
}

async function fetchGroupMessages(groupId) {
    const { data, error } = await supabase
        .from('group_messages')
        .select('*, sender:sender_id (id, username, avatar)')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });
    if (error) return [];
    return data;
}

// ================== دوال طلبات المتابعة ==================
async function sendFollowRequest(senderId, receiverId) {
    const { error } = await supabase.from('follow_requests').insert({ sender_id: senderId, receiver_id: receiverId });
    if (!error) {
        await createNotification(receiverId, 'follow_request', senderId, null, null, null, null);
    }
    return !error;
}

async function getFollowRequests(userId) {
    const { data, error } = await supabase
        .from('follow_requests')
        .select('*, sender:sender_id (id, username, avatar)')
        .eq('receiver_id', userId);
    if (error) return [];
    return data;
}

async function acceptFollowRequest(requestId, senderId, receiverId) {
    await supabase.from('follow_requests').delete().eq('id', requestId);
    await supabase.from('follows').insert({ follower_id: senderId, following_id: receiverId });
    await createNotification(senderId, 'follow', receiverId, null, null, null, `${receiverId} قبل طلب متابعتك`);
}

async function rejectFollowRequest(requestId) {
    await supabase.from('follow_requests').delete().eq('id', requestId);
}

// ================== دوال إعدادات الإشعارات ==================
async function getNotificationSettings(userId) {
    const { data, error } = await supabase
        .from('notification_settings')
        .select('settings')
        .eq('user_id', userId)
        .single();
    if (error) {
        const defaultSettings = {
            like: true, comment: true, favorite: true, repost: true, follow: true,
            follow_request: true, story: true, new_post: true, profile_update: true,
            group_message: true, private_message: true, sound_enabled: true
        };
        await supabase.from('notification_settings').insert({ user_id: userId, settings: defaultSettings });
        return defaultSettings;
    }
    return data.settings;
}

async function updateNotificationSetting(userId, settingKey, value) {
    const current = await getNotificationSettings(userId);
    current[settingKey] = value;
    await supabase.from('notification_settings').update({ settings: current }).eq('user_id', userId);
}

// ================== دوال إضافية للمحادثات الفردية ==================
async function getUserById(userId) {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if (error) return null;
    return data;
}

async function getPrivateMessages(userId, otherUserId) {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${userId})`)
        .order('created_at', { ascending: true });
    if (error) return [];
    return data;
}

async function sendPrivateMessage(senderId, receiverId, text, image=null) {
    const { error } = await supabase.from('messages').insert({
        sender_id: senderId,
        receiver_id: receiverId,
        text: text,
        image: image,
        read: false,
        created_at: new Date().toISOString()
    });
    if (!error) {
        await createNotification(receiverId, 'private_message', senderId, null, null, null, `${senderId} أرسل لك رسالة جديدة`);
    }
    return !error;
}

// ================== تصدير الدوال للنطاق العام ==================
window.showToast = showToast;
window.formatNumber = formatNumber;
window.escapeHtml = escapeHtml;
window.initDB = initDB;
window.checkSession = checkSession;
window.createGuestUser = createGuestUser;
window.upgradeGuestToVerified = upgradeGuestToVerified;
window.fetchFeed = fetchFeed;
window.getUserInteractions = getUserInteractions;
window.createPost = createPost;
window.toggleLike = toggleLike;
window.toggleFavorite = toggleFavorite;
window.toggleRepost = toggleRepost;
window.toggleFollow = toggleFollow;
window.fetchComments = fetchComments;
window.addComment = addComment;
window.incrementPostViews = incrementPostViews;
window.incrementCommentLikes = incrementCommentLikes;
window.increaseView = incrementPostViews;

// تصدير الدوال الجديدة
window.createNotification = createNotification;
window.fetchNotifications = fetchNotifications;
window.markNotificationAsRead = markNotificationAsRead;
window.getUnreadNotificationsCount = getUnreadNotificationsCount;
window.fetchStories = fetchStories;
window.createStory = createStory;
window.createGroup = createGroup;
window.fetchUserGroups = fetchUserGroups;
window.sendGroupMessage = sendGroupMessage;
window.fetchGroupMessages = fetchGroupMessages;
window.sendFollowRequest = sendFollowRequest;
window.getFollowRequests = getFollowRequests;
window.acceptFollowRequest = acceptFollowRequest;
window.rejectFollowRequest = rejectFollowRequest;
window.getNotificationSettings = getNotificationSettings;
window.updateNotificationSetting = updateNotificationSetting;
window.getUserById = getUserById;
window.getPrivateMessages = getPrivateMessages;
window.sendPrivateMessage = sendPrivateMessage;
