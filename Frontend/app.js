// Updated Toxic Friend App with localStorage and improved navigation
const DEFAULT_USER_AVATAR = "🙂";
const USER_ID_STORAGE_KEY = "userId";
let previousStepBeforeSettings = null;
let settingsSelectedTheme = null;
let settingsInitialSnapshot = null;
let suppressSettingsDirtyCheck = false;

let appState = {
    theme: "dark",
    accent: "rose",
    gender: null,
    fault: null,
    scenario: null,
    toxicity: 50,
    conversationHistory: [],
    friendName: "",
    userName: "",
    userAvatar: DEFAULT_USER_AVATAR,
    messageCount: 0,
    userEmotion: "neutral",
    conversationMood: "tense",
    apologyDetected: false,
    escalationLevel: 0,
    currentChatMessages: [],
    currentChatId: null,
    currentStory: "",
    isFromHistory: false,
    userId: null,
};

let feedbackRating = 5;

let globalNameEnterListenerAttached = false;
let mobileKeyboardUpdateHandler = null;

const friendNamePools = {
    male: [
        "Alex", "Ethan", "Liam", "Noah", "Mason", "Logan", "Caleb", "Owen", "Julian", "Isaac",
        "Elijah", "Gabriel", "Micah", "Nathan", "Zayden", "Aiden", "Samuel", "Levi", "Grayson", "Mateo"
    ],
    female: [
        "Sarah", "Mia", "Ava", "Lily", "Chloe", "Harper", "Scarlett", "Layla", "Nora", "Zoe",
        "Stella", "Hazel", "Aria", "Violet", "Isla", "Ruby", "Aurora", "Elena", "Naomi", "Sienna"
    ]
};

const avatarChoices = [
    { id: "friendly", label: "Friendly", emoji: "🙂" },
    { id: "cool", label: "Confident", emoji: "😎" },
    { id: "curious", label: "Curious", emoji: "🤓" },
    { id: "calm", label: "Calm", emoji: "😌" },
    { id: "adventurous", label: "Adventurous", emoji: "🤠" },
    { id: "clever", label: "Playful", emoji: "🦊" },
];

const ACCENT_OPTIONS = {
    rose: { name: "Rose", color: "#FF6B6B", hover: "#FF8E72", rgb: "255, 107, 107" },
    amber: { name: "Amber", color: "#FF9F43", hover: "#FFB870", rgb: "255, 159, 67" },
    mint: { name: "Mint", color: "#34D399", hover: "#6EE7B7", rgb: "52, 211, 153" },
    aqua: { name: "Aqua", color: "#38BDF8", hover: "#7DD3FC", rgb: "56, 189, 248" },
    violet: { name: "Violet", color: "#A78BFA", hover: "#C4B5FD", rgb: "167, 139, 250" },
    indigo: { name: "Indigo", color: "#6366F1", hover: "#818CF8", rgb: "99, 102, 241" },
};

// Update this constant to point at your deployed backend.
const BACKEND_BASE_URL = "https://toxicfriend.pythonanywhere.com";

const API_ENDPOINTS = {
    logins: "/api/logins",
    feedback: "/api/feedback",
};

function buildBackendUrl(path = "") {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${BACKEND_BASE_URL}${normalizedPath}`;
}

async function postJsonToBackend(path, payload) {
    const url = buildBackendUrl(path);
    let response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            mode: "cors",
            credentials: "omit",
        });
    } catch (networkError) {
        throw new Error(networkError.message || "Network request failed");
    }

    const text = await response.text();
    let data = {};
    if (text) {
        try {
            data = JSON.parse(text);
        } catch (parseError) {
            data = { raw: text };
        }
    }

    if (!response.ok) {
        const message = data?.error || `Request failed with status ${response.status}`;
        throw new Error(message);
    }

    return data;
}

function logBackendError(context, error) {
    console.error(`[Backend:${context}]`, error);
}

function generateUserId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
    return template.replace(/[xy]/g, (char) => {
        const rand = (Math.random() * 16) | 0;
        const value = char === "x" ? rand : (rand & 0x3) | 0x8;
        return value.toString(16);
    });
}

function ensureUserId() {
    if (appState.userId) {
        return appState.userId;
    }
    const stored = localStorage.getItem(USER_ID_STORAGE_KEY);
    if (stored) {
        appState.userId = stored;
        return stored;
    }
    const newId = generateUserId();
    appState.userId = newId;
    localStorage.setItem(USER_ID_STORAGE_KEY, newId);
    return newId;
}

function sendUserNameToBackend(name) {
    if (!name) return Promise.resolve();
    const userId = ensureUserId();
    return postJsonToBackend(API_ENDPOINTS.logins, { name, user_id: userId });
}

ensureUserId();

function sendFeedbackToBackend({ name, stars, message }) {
    return postJsonToBackend(API_ENDPOINTS.feedback, { name, stars, message });
}

let usedFriendNames = getFromLocalStorage("usedFriendNames");
if (!usedFriendNames || typeof usedFriendNames !== "object") {
    usedFriendNames = { male: [], female: [] };
}

function persistUsedFriendNames() {
    saveToLocalStorage("usedFriendNames", usedFriendNames);
}

function getUniqueFriendName(gender = "male") {
    const normalizedGender = gender === "female" ? "female" : "male";
    const pool = friendNamePools[normalizedGender] || friendNamePools.male;
    if (!Array.isArray(pool) || pool.length === 0) {
        return normalizedGender === "female" ? "Sarah" : "Alex";
    }

    usedFriendNames[normalizedGender] = usedFriendNames[normalizedGender] || [];

    let availableNames = pool.filter((name) => !usedFriendNames[normalizedGender].includes(name));

    if (availableNames.length === 0) {
        usedFriendNames[normalizedGender] = [];
        availableNames = [...pool];
    }

    const randomName = availableNames[Math.floor(Math.random() * availableNames.length)];
    usedFriendNames[normalizedGender].push(randomName);
    persistUsedFriendNames();
    return randomName;
}

function inferGenderFromName(name) {
    if (friendNamePools.male.includes(name)) return "male";
    if (friendNamePools.female.includes(name)) return "female";
    return "male";
}

function getDefaultUserAvatar() {
    if (avatarChoices.length > 0) {
        return avatarChoices[0].emoji;
    }
    return DEFAULT_USER_AVATAR;
}

function updateSidebarAvatar() {
    const userGreeting = document.querySelector(".user-greeting");
    if (userGreeting) {
        userGreeting.textContent = appState.userAvatar || getDefaultUserAvatar();
    }
}

function setSelectedAvatar(emoji, options = {}) {
    if (!emoji) return;
    
    const { persist = false } = options;
    
    appState.userAvatar = emoji;
    
    const avatarButtons = document.querySelectorAll(".avatar-option");
    if (avatarButtons.length) {
        avatarButtons.forEach((button) => {
            const isSelected = button.dataset.avatarEmoji === emoji;
            button.classList.toggle("selected", isSelected);
            button.setAttribute("aria-pressed", isSelected ? "true" : "false");
        });
    }
    
    if (persist) {
        localStorage.setItem('userAvatar', emoji);
    }
    
    updateSidebarAvatar();
    
    if (!suppressSettingsDirtyCheck) {
        const settingsStep = document.getElementById("settings-step");
        if (settingsStep && settingsStep.classList.contains("active")) {
            requestSettingsDirtyCheck();
        }
    }
}

function updateSettingsThemeButtons() {
    const themeButtons = document.querySelectorAll("[data-settings-theme]");
    if (!themeButtons.length) return;
    
    themeButtons.forEach((button) => {
        const isSelected = button.dataset.settingsTheme === settingsSelectedTheme;
        button.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
}

function getCurrentSettingsSnapshot() {
    const nameInput = document.getElementById("settings-name-input");
    return {
        name: nameInput ? nameInput.value.trim() : "",
        theme: settingsSelectedTheme || appState.theme || "dark",
        avatar: appState.userAvatar || getDefaultUserAvatar(),
    };
}

function captureSettingsInitialSnapshot() {
    settingsInitialSnapshot = getCurrentSettingsSnapshot();
}

function hasSettingsChanged() {
    if (!settingsInitialSnapshot) {
        return false;
    }
    const current = getCurrentSettingsSnapshot();
    return (
        current.name !== settingsInitialSnapshot.name ||
        current.theme !== settingsInitialSnapshot.theme ||
        current.avatar !== settingsInitialSnapshot.avatar
    );
}

function updateSettingsSaveVisibility() {
    const saveBtn = document.getElementById("settings-save-btn");
    if (!saveBtn) return;
    
    if (!settingsInitialSnapshot) {
        saveBtn.style.display = "none";
        return;
    }
    
    const shouldShow = hasSettingsChanged();
    saveBtn.style.display = shouldShow ? "" : "none";
}

function requestSettingsDirtyCheck() {
    if (suppressSettingsDirtyCheck) return;
    updateSettingsSaveVisibility();
}

function revertSettingsChangesIfNeeded() {
    if (!settingsInitialSnapshot) return;
    if (!hasSettingsChanged()) return;
    
    suppressSettingsDirtyCheck = true;
    
    const { name, theme, avatar } = settingsInitialSnapshot;
    
    if (theme && theme !== appState.theme) {
        applyTheme(theme, { persist: false });
        settingsSelectedTheme = theme;
        updateSettingsThemeButtons();
    }
    
    if (avatar && avatar !== appState.userAvatar) {
        setSelectedAvatar(avatar);
    }
    
    const nameInput = document.getElementById("settings-name-input");
    if (nameInput) {
        nameInput.value = name || "";
    }
    
    suppressSettingsDirtyCheck = false;
    updateSettingsSaveVisibility();
}

function populateSettingsForm() {
    suppressSettingsDirtyCheck = true;
    const nameInput = document.getElementById("settings-name-input");
    if (nameInput) {
        nameInput.value = appState.userName || "";
    }
    
    settingsSelectedTheme = appState.theme || localStorage.getItem('userTheme') || "dark";
    updateSettingsThemeButtons();
    
    if (appState.userAvatar) {
        setSelectedAvatar(appState.userAvatar);
    } else {
        setSelectedAvatar(getDefaultUserAvatar());
    }
    
    const feedback = document.getElementById("settings-feedback");
    if (feedback) {
        feedback.textContent = "";
        feedback.classList.remove("success", "error");
    }
    
    initSettingsThemePicker();
    suppressSettingsDirtyCheck = false;
    captureSettingsInitialSnapshot();
    updateSettingsSaveVisibility();
}

function openSettingsPage() {
    const activeStep = document.querySelector(".step.active");
    previousStepBeforeSettings = activeStep ? activeStep.id : "chat-step";
    populateSettingsForm();
    showStep("settings-step");
}

function closeSettingsPage() {
    const targetStep = previousStepBeforeSettings || "chat-step";
    previousStepBeforeSettings = null;
    showStep(targetStep);
}

function showSettingsFeedback(message, type = "success") {
    const feedback = document.getElementById("settings-feedback");
    if (!feedback) return;
    
    feedback.textContent = message;
    feedback.classList.remove("success", "error");
    if (type === "success") {
        feedback.classList.add("success");
    } else if (type === "error") {
        feedback.classList.add("error");
    }
}

function handleSettingsSave() {
    const nameInput = document.getElementById("settings-name-input");
    if (!nameInput) return;
    
    const name = nameInput.value.trim();
    if (!name) {
        nameInput.classList.add("shake");
        setTimeout(() => nameInput.classList.remove("shake"), 400);
        showSettingsFeedback("Please enter your name.", "error");
        return;
    }
    
    appState.userName = name;
    localStorage.setItem('userName', name);
    updateUserPersonalization();
    document.getElementById("user-name-display").style.display = "flex";
    updateNoChatsMessage();

    sendUserNameToBackend(name).catch((error) => {
        logBackendError("logins", error);
    });
    
    if (settingsSelectedTheme) {
        applyTheme(settingsSelectedTheme);
    }
    
    if (!appState.userAvatar) {
        setSelectedAvatar(getDefaultUserAvatar());
    }
    
    if (appState.userAvatar) {
        localStorage.setItem('userAvatar', appState.userAvatar);
    }
    
    captureSettingsInitialSnapshot();
    updateSettingsSaveVisibility();
    
    showSettingsFeedback("Changes have been saved.", "success");
}

function initSettingsThemePicker() {
    const settingsStep = document.getElementById("settings-step");
    if (!settingsStep) return;
    
    if (settingsStep.dataset.themePickerInitialized === "true") {
        return;
    }
    
    const themeCards = settingsStep.querySelectorAll("[data-settings-theme]");
    themeCards.forEach((card) => {
        card.addEventListener("click", () => {
            const selectedTheme = card.dataset.settingsTheme;
            settingsSelectedTheme = selectedTheme;
            applyTheme(selectedTheme, { persist: false });
            updateSettingsThemeButtons();
            requestSettingsDirtyCheck();
        });
    });
    
    settingsStep.dataset.themePickerInitialized = "true";
}

function initAvatarSelection() {
    const avatarGrids = document.querySelectorAll("[data-avatar-grid]");
    if (!avatarGrids.length) {
        return;
    }
    
    avatarGrids.forEach((avatarGrid) => {
        if (avatarGrid.dataset.initialized === "true") {
            return;
        }
        
        avatarChoices.forEach(({ id, label, emoji }) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "avatar-option";
            button.dataset.avatarId = id;
            button.dataset.avatarEmoji = emoji;
            button.setAttribute("aria-pressed", "false");
            button.setAttribute("aria-label", `${label} avatar`);
            button.title = label;
            button.innerHTML = `<span class="avatar-option-emoji">${emoji}</span>`;
            
            button.addEventListener("click", () => {
                setSelectedAvatar(emoji);
            });
            
            button.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedAvatar(emoji);
                }
            });
            
            avatarGrid.appendChild(button);
        });
        
        avatarGrid.dataset.initialized = "true";
    });
    
    if (appState.userAvatar) {
        setSelectedAvatar(appState.userAvatar);
    } else if (avatarChoices.length > 0) {
        setSelectedAvatar(getDefaultUserAvatar());
    }
}

function updateChatAvatar(gender = appState.gender) {
    const avatarEl = document.getElementById("chat-avatar");
    if (avatarEl) {
        avatarEl.textContent = gender === "female" ? "👩🏻" : "👨🏻";
    }
}

function submitUserName() {
    const nameInput = document.getElementById("user-name-input");
    if (!nameInput) return;
    
    const name = nameInput.value.trim();
    if (!name) {
        nameInput.classList.add("shake");
        setTimeout(() => nameInput.classList.remove("shake"), 500);
        return;
    }
    
    appState.userName = name;
    
    if (!appState.userAvatar) {
        setSelectedAvatar(getDefaultUserAvatar());
    }
    
    if (appState.userAvatar) {
        localStorage.setItem('userAvatar', appState.userAvatar);
    }
    
    localStorage.setItem('userName', name);
    updateUserPersonalization();
    document.getElementById("user-name-display").style.display = "flex";
    updateNoChatsMessage();

    sendUserNameToBackend(name).catch((error) => {
        logBackendError("logins", error);
    });

    showStep("theme-step");
}

function isEnterKey(event) {
    if (!event) return false;
    
    const key = event.key ? event.key.toLowerCase() : "";
    const code = event.code ? event.code.toLowerCase() : "";
    
    return (
        key === "enter" ||
        key === "go" ||
        key === "done" ||
        code === "enter" ||
        event.keyCode === 13 ||
        event.which === 13
    );
}

const scenarios = {
    ignored: {
        name: "The Ignored Friend",
        context: {
            you: "You didn't reply to your friend's messages for a whole day, and now you're encountering them.",
            them: "Your friend ignored your messages for a whole day, and now you're confronting them.",
        },
        systemContext: {
            you: "You're talking to your friend who ignored your messages for a whole day. You're upset about this.",
            them: "You're talking to your friend. They ignored your messages for a whole day and you're upset about it.",
        },
        description: {
            you: "They've been waiting for your reply...",
            them: "They left you on read all day...",
        },
        keywords: ["sorry", "busy", "forgot", "phone", "message"],
        stories: {
            you: [
                "Last night at the party, you got completely caught up with other friends and forgot to check your phone. {friend} sent you several messages asking if you were okay, but you never replied. Now it's the next day and they just saw you were online...",
                "You were having such a great time at the game night that you completely ghosted {friend}'s messages. They were worried something happened to you. Now you're home and just opened their messages...",
                "Yesterday during the dinner with your family, {friend} kept texting you about something important. You saw the notifications but thought you'd reply later. You never did. Now they're calling you out...",
                "You spent the whole day binge-watching your favorite show and ignored {friend}'s messages. They needed your advice on something urgent. Now they're upset and confronting you...",
                "At the concert last night, you were having the time of your life and completely forgot to reply to {friend}. They sent you multiple messages checking in. Now you're realizing how badly you messed up...",
            ],
            them: [
                "You sent {friend} several messages yesterday asking if they wanted to hang out. They left you on read all day. You saw them posting stories with other people. Now they're finally texting you back...",
                "You needed {friend}'s help with something important yesterday. You messaged them multiple times but got no response. You saw they were active online. Now they're texting like nothing happened...",
                "Last night you were feeling down and reached out to {friend} for support. They completely ignored you even though you could see they were online. Now they're casually messaging you...",
                "You sent {friend} funny memes and messages all day yesterday. They didn't respond to a single one. You saw them commenting on other people's posts. Now they're texting you...",
                "You made plans with {friend} and messaged to confirm. They never replied, leaving you hanging. You ended up staying home alone. Now they're finally responding...",
            ],
        },
        firstMessages: {
            you: [
                "Hey, I just saw your messages from yesterday",
                "I'm really sorry I didn't reply sooner",
                "I know I should have texted you back",
                "Can we talk? I feel bad about yesterday",
                "I messed up by not responding",
            ],
            them: [
                "So you finally decided to reply?",
                "I waited all day for you to respond",
                "Did you forget about me or something?",
                "I guess your other friends were more important",
                "Thanks for leaving me on read",
            ],
        },
    },
    jealous: {
        name: "Jealous Partner",
        context: {
            you: "Your partner caught you talking to someone else and they're jealous.",
            them: "You caught your partner talking to someone else and you're feeling jealous.",
        },
        systemContext: {
            you: "You're talking to your partner. You saw them talking to someone else and you're feeling jealous and upset.",
            them: "You're talking to your partner who saw you talking to someone else. They're feeling jealous and upset.",
        },
        description: {
            you: "They caught you with someone else...",
            them: "You saw them with someone else...",
        },
        keywords: ["friend", "nothing", "just", "talking", "jealous"],
        stories: {
            you: [
                "At the coffee shop this morning, you ran into an old friend and got caught up in conversation. You were laughing and having a great time. {friend} walked by and saw you looking very comfortable with them...",
                "During lunch break, you were texting someone and smiling at your phone. {friend} noticed and asked who it was. You got a bit defensive. Now they're questioning you...",
                "Last night at the party, {friend} saw you talking closely with someone attractive. You didn't even notice they were watching. Now they want to talk about it...",
                "You've been mentioning this 'new friend' from work a lot lately. Today {friend} saw you two together and didn't like how friendly you seemed...",
                "At the gym, you were getting help from the instructor and seemed really engaged. {friend} showed up early and saw the whole thing. Now they're upset...",
            ],
            them: [
                "You just saw {friend}'s phone light up with messages from someone. They quickly hid it and changed the subject. This has been happening a lot lately...",
                "At the party last night, you saw {friend} laughing with someone else. They looked happier than they've been with you in weeks. Now you need to talk...",
                "{friend} has been spending a lot of time with their 'coworker' lately. Today you saw them together at the mall. They looked very comfortable...",
                "You noticed {friend} has been dressing nicer and checking their phone constantly. Today you saw them smiling at messages from someone. You're done staying quiet...",
                "{friend} cancelled plans with you to 'work late' but you saw them posting at a restaurant with someone else. Now they're home and you're waiting...",
            ],
        },
        firstMessages: {
            you: [
                "I can tell something's bothering you",
                "You seem upset about earlier",
                "Can we talk about what happened?",
                "I noticed you've been quiet",
                "Is everything okay between us?",
            ],
            them: [
                "Who was that person you were talking to?",
                "You seemed really happy with them",
                "So that's your 'friend' from work?",
                "I saw how you were looking at them",
                "We need to talk about what I saw",
            ],
        },
    },
    flaker: {
        name: "The Flaker",
        context: {
            you: "You canceled plans at the last minute.",
            them: "Your friend canceled plans with you at the last minute.",
        },
        systemContext: {
            you: "You're talking to your friend who canceled plans with you at the last minute. You're disappointed and annoyed.",
            them: "You're talking to your friend. You canceled plans with them at the last minute and they're disappointed and annoyed.",
        },
        description: {
            you: "You bailed on them last minute...",
            them: "They canceled on you again...",
        },
        keywords: ["emergency", "sorry", "reschedule", "promise", "next time"],
        stories: {
            you: [
                "You and {friend} had dinner reservations tonight. Two hours before, you texted saying you can't make it because 'something came up'. They had already gotten ready and were looking forward to it...",
                "You promised {friend} you'd help them move this weekend. This morning you cancelled saying you're not feeling well, but they saw your Instagram story at brunch with other friends...",
                "Movie night was planned for weeks. An hour before, you bailed saying you're too tired. {friend} already bought snacks and cleared their schedule. Now they're messaging you...",
                "You agreed to go to {friend}'s important work event as their plus one. The day before, you cancelled saying you forgot about another commitment. They're furious...",
                "Beach trip with {friend} was set for today. Last night you texted saying you can't go anymore because of 'family stuff'. They rearranged their whole weekend for this...",
            ],
            them: [
                "You had plans with {friend} tonight. You've been excited all week. 30 minutes before meeting, they text saying they can't make it. Again. This is the third time this month...",
                "{friend} promised to help you with your project due tomorrow. They just cancelled saying they're too busy. You've been counting on them for days...",
                "You took time off work to hang out with {friend} today. They just texted that something else came up. You could have made other plans...",
                "Concert tickets you both bought months ago. {friend} just said they're not going anymore because they're 'not in the mood'. The show is in 2 hours...",
                "You organized a whole birthday surprise for someone and {friend} was supposed to help. They bailed last minute leaving you to handle everything alone. Now they're texting...",
            ],
        },
        firstMessages: {
            you: [
                "I know this is last minute, but I can't make it",
                "Something came up and I have to cancel",
                "I'm really sorry but I need to reschedule",
                "I feel terrible but I can't come tonight",
                "Can we do this another time?",
            ],
            them: [
                "Are you seriously canceling again?",
                "This is the third time you've done this",
                "I already made all these plans for us",
                "You always bail at the last second",
                "I should have known you'd cancel",
            ],
        },
    },
    money: {
        name: "Money Matters",
        context: {
            you: "You forgot to pay your friend back the money you owe them.",
            them: "Your friend forgot to pay you back the money they owe you.",
        },
        systemContext: {
            you: "You're talking to your friend who owes you money and forgot to pay you back. You need to bring this up.",
            them: "You're talking to your friend. You owe them money and forgot to pay them back. They need to bring this up.",
        },
        description: {
            you: "You forgot to pay them back...",
            them: "They forgot to pay you back...",
        },
        keywords: ["pay", "money", "forgot", "soon", "promise"],
        stories: {
            you: [
                "{friend} lent you $200 for rent three weeks ago. You said you'd pay them back last Friday but completely forgot. Today you posted about buying new shoes. They just messaged you...",
                "You borrowed money from {friend} for concert tickets last month. You promised to pay them back 'next week' but it's been 6 weeks. They just asked about it...",
                "{friend} covered your part of the dinner bill ($80) because you 'forgot your wallet'. You said you'd Venmo them that night. It's been two weeks and you haven't...",
                "Emergency car repair - {friend} lent you $300. You've been avoiding the topic and spending money on other things. Today they saw you bought a new gadget. They're texting now...",
                "You owe {friend} $150 from the trip you took together. You keep saying you'll pay 'tomorrow' but it's been over a month. They're frustrated and bringing it up again...",
            ],
            them: [
                "You lent {friend} $250 two months ago for their 'emergency'. They keep saying they'll pay you back but you saw them at an expensive restaurant yesterday...",
                "{friend} owes you $120 from when they 'forgot their wallet'. Every time you bring it up, they change the subject. You need that money for bills this week...",
                "You covered {friend}'s share of rent ($400) when they were short. They promised to pay you back 'next paycheck'. It's been three paychecks. You're done being patient...",
                "{friend} borrowed $180 for 'something important'. They've been posting about shopping and going out but haven't mentioned paying you back. You're texting them now...",
                "Concert tickets you bought for both of you ($160). {friend} said they'd pay their half 'later'. It's been 2 months and they act like they forgot. Time to remind them...",
            ],
        },
        firstMessages: {
            you: [
                "Hey, I know I owe you money",
                "About that money I borrowed...",
                "I haven't forgotten about paying you back",
                "Can we talk about what I owe you?",
                "I'm sorry I haven't paid you yet",
            ],
            them: [
                "So... when are you paying me back?",
                "Remember that money you owe me?",
                "It's been weeks since you borrowed that money",
                "I really need that money back now",
                "Did you forget you owe me?",
            ],
        },
    },
    snub: {
        name: "Social Snub",
        context: {
            you: "You went out with other friends without inviting them, and they saw it on social media.",
            them: "Your friend went out with others without inviting you, and you saw it on social media.",
        },
        systemContext: {
            you: "You're talking to your friend who went out with others without inviting you. You saw it on social media and you're hurt.",
            them: "You're talking to your friend. You went out with others without inviting them. They saw it on social media and they're hurt.",
        },
        description: {
            you: "You left them out...",
            them: "They excluded you...",
        },
        keywords: [
            "didn't think",
            "last minute",
            "small",
            "sorry",
            "next time",
        ],
        stories: {
            you: [
                "Last night you went to a party with your other friends. You posted several Instagram stories. {friend} saw them and realized you never even mentioned it to them...",
                "Weekend trip to the beach with a group of friends. You posted tons of photos. {friend} saw them all hanging out and they weren't invited. Now they're questioning your friendship...",
                "You organized a dinner party and invited everyone except {friend}. They found out through someone else's story. Now they're messaging you asking why...",
                "Game night at your place last night. {friend} saw everyone's stories and realized they were the only one not there. You didn't even think to invite them...",
                "You went to that new restaurant everyone's been talking about with a group. Posted the whole thing on social media. {friend} had been wanting to go there with you...",
            ],
            them: [
                "{friend} posted a whole Instagram story series of them at an event with all your mutual friends. Everyone was there except you. Nobody even mentioned it to you...",
                "You saw photos of {friend}'s birthday dinner. All your friend group was there. You didn't even know it was happening. They never invited you...",
                "{friend} went on a road trip with everyone from your squad. You saw the posts. They all planned it in a group chat you're apparently not in anymore...",
                "Concert you've been dying to go to. {friend} went with your whole friend group. You found out from their Snapchat stories. You weren't even considered...",
                "You saw {friend} posted about 'best day ever' with all the people you usually hang out with. You were at home alone. They clearly didn't want you there...",
            ],
        },
        firstMessages: {
            you: [
                "Hey, I saw you were online",
                "How's your day going?",
                "Haven't talked to you in a while",
                "What have you been up to?",
                "Hope you're doing well",
            ],
            them: [
                "Saw your post from last night",
                "Looks like you had fun without me",
                "Didn't realize you were all hanging out",
                "So I wasn't invited?",
                "Nice to know where I stand",
            ],
        },
    },
};


function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function setCookie(name, value, days = 365) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = `expires=${date.toUTCString()}`;
    document.cookie = `${name}=${value};${expires};path=/`;
}

function updateUserPersonalization() {
    const nameText = document.querySelector(".user-name-text");
    const statusText = document.getElementById("user-status-text");
    
    if (nameText) {
        nameText.textContent = appState.userName || "";
    }
    
    if (statusText) {
        statusText.textContent = appState.userName
            ? `Stay grounded, ${appState.userName}`
            : "Ready when you are";
    }
    
    updateSidebarAvatar();
}

function updateNoChatsMessage() {
    const placeholder = document.querySelector(".no-chats");
    if (!placeholder) return;
    
    if (!appState.userName) {
        placeholder.textContent = "No saved chats yet";
        return;
    }
    
    placeholder.innerHTML = "";
    
    const nameSpan = document.createElement("span");
    nameSpan.className = "no-chats-name";
    nameSpan.textContent = appState.userName;
    
    const detailSpan = document.createElement("span");
    detailSpan.className = "no-chats-detail";
    detailSpan.textContent = " hasn't saved any chats yet.";
    
    const subText = document.createElement("span");
    subText.className = "no-chats-subtext";
    subText.textContent = "Start a new conversation to build your library.";
    
    placeholder.appendChild(nameSpan);
    placeholder.appendChild(detailSpan);
    placeholder.appendChild(subText);
}

function init() {
    // Check if welcome flow has been completed first
    const welcomeCompleted = localStorage.getItem('welcomeFlowCompleted');
    
    if (welcomeCompleted !== 'true') {
        // Show welcome flow for first-time users
        const showWelcome = initWelcomeFlow();
        if (showWelcome) {
            showStep('welcome-flow');
            setupEventListeners();
            setupThemeToggle();
            return;
        }
    }
    
    loadChatHistory();
    
    // Check if user has already completed onboarding
    const savedName = localStorage.getItem('userName');
    const savedTheme = localStorage.getItem('userTheme');
    const savedAvatar = localStorage.getItem('userAvatar');
    const hasCompletedOnboarding = localStorage.getItem('onboardingComplete');
    
    if (savedAvatar) {
        appState.userAvatar = savedAvatar;
        updateSidebarAvatar();
    } else {
        appState.userAvatar = getDefaultUserAvatar();
        updateSidebarAvatar();
    }
    
    // Apply default accent color (rose)
    applyAccent(appState.accent, { persist: false });

    if (savedName && hasCompletedOnboarding === 'true') {
        // User has completed onboarding, skip to gender selection
        appState.userName = savedName;
        updateUserPersonalization();
        document.getElementById("user-name-display").style.display = "flex";
        updateNoChatsMessage();
        
        // Apply saved theme
        if (savedTheme) {
            applyTheme(savedTheme, { persist: false });
        }
        
        showStep("gender-step");
    } else if (savedName && savedTheme) {
        // Has name and theme, show gender selection and mark complete
        appState.userName = savedName;
        appState.theme = savedTheme;
        updateUserPersonalization();
        document.getElementById("user-name-display").style.display = "flex";
        updateNoChatsMessage();
        
        if (savedTheme) {
            applyTheme(savedTheme, { persist: false });
        }
        
        localStorage.setItem('onboardingComplete', 'true');
        showStep("gender-step");
    } else {
        // First time user
        showStep("name-step");
    }
    
    // Initialize toxicity display to show emoji at default value
    updateToxicityDisplay(50);
    
    setupEventListeners();
    setupThemeToggle();
    
    settingsSelectedTheme = appState.theme || 'dark';
}

function setupEventListeners() {
    initAvatarSelection();
    initThemePicker();
    
    const nameContinueBtn = document.getElementById("name-continue-btn");
    if (nameContinueBtn) {
        nameContinueBtn.addEventListener("click", submitUserName);
    }
    
    const nameInputField = document.getElementById("user-name-input");
    if (nameInputField) {
        const handleNameEnter = (e) => {
            if (isEnterKey(e)) {
                e.preventDefault();
                submitUserName();
            }
        };
        
        nameInputField.addEventListener("keydown", handleNameEnter);
        nameInputField.addEventListener("keypress", handleNameEnter);
        nameInputField.addEventListener("keyup", handleNameEnter);
    }
    
    if (!globalNameEnterListenerAttached) {
        document.addEventListener("keydown", (e) => {
            if (!isEnterKey(e)) return;
            
            const activeElement = document.activeElement;
            if (activeElement && activeElement.id === "user-name-input") {
                e.preventDefault();
                submitUserName();
            }
        }, true);
        
        globalNameEnterListenerAttached = true;
    }


    document.querySelectorAll("[data-gender]").forEach((btn) => {
        btn.addEventListener("click", () => {
            appState.gender = btn.dataset.gender;
            appState.friendName = getUniqueFriendName(appState.gender);
            updateChatAvatar(appState.gender);
            showStep("fault-step");
        });
    });

    document.querySelectorAll("[data-fault]").forEach((btn) => {
        btn.addEventListener("click", () => {
            appState.fault = btn.dataset.fault;
            showStep("scenario-step");
            populateScenarios();
        });
    });

    document
        .getElementById("story-continue-btn")
        .addEventListener("click", () => {
            showStep("toxicity-step");
        });

    const toxicitySlider = document.getElementById("toxicity-slider");
    toxicitySlider.addEventListener("input", (e) => {
        updateToxicityDisplay(e.target.value);
    });

    document
        .getElementById("start-chat-btn")
        .addEventListener("click", () => {
            startNewChat();
        });

    // Chat input setup - will be initialized when chat step is shown
    // (moved to initChatInputHandlers function)

    document.getElementById("chat-back-btn").addEventListener("click", () => {
        if (appState.messageCount > 0) {
            saveCurrentChat();
        }
        
        resetConversationState();
        appState.isFromHistory = false;
        showStep("gender-step");
    });

    document.getElementById("review-back-btn").addEventListener("click", () => {
        showStep("chat-step");
    });

    setupChatDropdownMenu();

    document.getElementById("new-chat-btn").addEventListener("click", () => {
        saveChatBeforeReset();
        resetConversationState();
        showStep("chat-step");
    });

    document.querySelectorAll(".back-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const targetStep = e.target.dataset.backTo;
            const hasCompletedOnboarding = localStorage.getItem('onboardingComplete');
            
            // Prevent going back to name or theme steps after onboarding is complete
            if (hasCompletedOnboarding === 'true' && (targetStep === 'name-step' || targetStep === 'theme-step')) {
                showStep("gender-step");
            } else if (targetStep) {
                showStep(targetStep);
            }
        });
    });

    const settingsBtn = document.getElementById("settings-btn");
    if (settingsBtn) {
        settingsBtn.addEventListener("click", (e) => {
            e.preventDefault();
            openSettingsPage();
            const sidebar = document.getElementById("left-sidebar");
            if (sidebar && sidebar.classList.contains("mobile-open")) {
                sidebar.classList.remove("mobile-open");
            }
        });
    }
    
    document.querySelectorAll("[data-settings-theme]").forEach((btn) => {
        btn.addEventListener("click", () => {
            settingsSelectedTheme = btn.dataset.settingsTheme;
            updateSettingsThemeButtons();
            requestSettingsDirtyCheck();
        });
    });
    
    const settingsSaveBtn = document.getElementById("settings-save-btn");
    if (settingsSaveBtn) {
        settingsSaveBtn.addEventListener("click", handleSettingsSave);
    }
    
    const settingsNameInput = document.getElementById("settings-name-input");
    if (settingsNameInput) {
        settingsNameInput.addEventListener("input", () => {
            requestSettingsDirtyCheck();
        });
    }

    const menuChat = document.getElementById("menu-chat");
    if (menuChat) {
        menuChat.addEventListener("click", () => {
            const mainMenu = document.getElementById("main-menu");
            if (mainMenu) mainMenu.classList.remove("visible");
            saveChatBeforeReset();
            resetConversationState();
            showStep("name-step");
        });
    }

    const menuAnalyzer = document.getElementById("menu-analyzer");
    if (menuAnalyzer) {
        menuAnalyzer.addEventListener("click", () => {
            const mainMenu = document.getElementById("main-menu");
            if (mainMenu) mainMenu.classList.remove("visible");
            showStep("analyzer-step");
        });
    }

    // Navigation bar buttons (desktop)
    const navChat = document.getElementById("nav-chat");
    if (navChat) {
        navChat.addEventListener("click", () => {
            saveChatBeforeReset();
            resetConversationState();
            showStep("gender-step");
            const sidebar = document.getElementById("left-sidebar");
            sidebar.classList.remove("mobile-open");
            
            
        });
    }

    const navAnalyzer = document.getElementById("nav-analyzer");
    if (navAnalyzer) {
        navAnalyzer.addEventListener("click", () => {
            showStep("analyzer-step");
            const sidebar = document.getElementById("left-sidebar");
            sidebar.classList.remove("mobile-open");
        });
    }

    const navFeedback = document.getElementById("nav-feedback");
    if (navFeedback) {
        navFeedback.addEventListener("click", () => {
            showStep("feedback-step");
            const sidebar = document.getElementById("left-sidebar");
            if (sidebar) {
                sidebar.classList.remove("mobile-open");
            }
        });
    }

    document.getElementById("analyze-btn").addEventListener("click", () => {
        analyzeMessage();
    });

    document
        .getElementById("analyzer-close-btn")
        .addEventListener("click", () => {
            document.getElementById("analyzer-modal").classList.remove("active");
        });

    // Enhanced mobile keyboard handling - keeps chat stable when keyboard opens (like WhatsApp)
    if (window.visualViewport) {
        const handleViewportResize = () => {
            if (document.getElementById("chat-step").classList.contains("active")) {
                const chatWrapper = document.querySelector(".chat-wrapper");
                const chatMessages = document.getElementById("chat-messages");
                if (chatWrapper && chatMessages) {
                    const viewportHeight = window.visualViewport.height;
                    chatWrapper.style.height = viewportHeight + "px";
                    // Scroll to bottom when keyboard appears
                    syncChatScrollState({ container: chatMessages, forceScroll: true });
                }
            }
        };
        
        window.visualViewport.addEventListener("resize", handleViewportResize);
        window.visualViewport.addEventListener("scroll", handleViewportResize);
        
        // Prevent zoom on input focus (mobile)
        const chatInput = document.getElementById("chat-input");
        if (chatInput) {
            chatInput.addEventListener("focus", () => {
                setTimeout(handleViewportResize, 300);
            });
        }
    }

    initFeedbackForm();
}

function saveChatBeforeReset() {
    const chatStep = document.getElementById("chat-step");
    if (
        chatStep &&
        chatStep.classList.contains("active") &&
        appState.messageCount > 0
    ) {
        saveCurrentChat();
    }
}

function autoSaveChatIfNeeded(targetStep) {
    const chatStep = document.getElementById("chat-step");
    const isLeavingChat =
        chatStep &&
        chatStep.classList.contains("active") &&
        targetStep !== "chat-step";
    
    if (isLeavingChat && appState.messageCount > 0) {
        saveCurrentChat();
    }
}

function showStep(stepId) {
    autoSaveChatIfNeeded(stepId);
    
    const settingsStepEl = document.getElementById("settings-step");
    const wasSettingsActive = settingsStepEl && settingsStepEl.classList.contains("active");
    if (wasSettingsActive && stepId !== "settings-step") {
        revertSettingsChangesIfNeeded();
    }
    
    document.querySelectorAll(".step").forEach((step) => {
        step.classList.remove("active");
    });

    const targetStep = document.getElementById(stepId);
    targetStep.classList.add("active");
    
    // Hide sidebar during welcome/onboarding steps
    const sidebar = document.getElementById("left-sidebar");
    const onboardingStepsToHideSidebar = ["welcome-flow", "name-step", "theme-step"];
    
    if (onboardingStepsToHideSidebar.includes(stepId)) {
        if (sidebar) sidebar.classList.add("hidden-onboarding");
    } else {
        if (sidebar) sidebar.classList.remove("hidden-onboarding");
    }

    const menuBtn = document.getElementById("menu-btn");
    const userNameDisplay = document.getElementById("user-name-display");
    const navBar = document.getElementById("nav-bar");
    
    // Onboarding steps - hide nav bar for focused experience
    const navHiddenSteps = ["name-step", "theme-step", "gender-step", "fault-step", "scenario-step", "story-step", "toxicity-step"];
    const menuHiddenSteps = ["welcome-flow", "name-step", "theme-step"];
    
    if (menuBtn) {
        if (menuHiddenSteps.includes(stepId)) {
            menuBtn.classList.add("hidden-onboarding");
            menuBtn.classList.remove("visible");
            menuBtn.classList.remove("in-chat");
        } else if (stepId === "chat-step") {
            menuBtn.classList.remove("hidden-onboarding");
            menuBtn.classList.add("visible");
            menuBtn.classList.add("in-chat");
        } else {
            menuBtn.classList.remove("hidden-onboarding");
            menuBtn.classList.add("visible");
            menuBtn.classList.remove("in-chat");
        }
    }
    
    if (navBar) {
        if (navHiddenSteps.includes(stepId) || menuHiddenSteps.includes(stepId)) {
            navBar.classList.remove("visible");
        } else if (stepId === "chat-step") {
            navBar.classList.add("visible");
        } else {
            navBar.classList.add("visible");
        }
    }
    
    if (userNameDisplay) {
        if (appState.userName) {
            userNameDisplay.style.display = "flex";
        } else {
            userNameDisplay.style.display = "none";
        }
    }

    if (stepId === "name-step") {
        const nameInput = document.getElementById("user-name-input");
        if (nameInput) {
            const storedName = appState.userName || localStorage.getItem("userName") || "";
            nameInput.value = storedName;
        }
    }
}

function populateScenarios() {
    const grid = document.getElementById("scenario-grid");
    grid.innerHTML = "";

    const emojiMap = {
        ignored: "📱",
        jealous: "😠",
        flaker: "🙅",
        money: "💰",
        snub: "🎉",
    };

    Object.keys(scenarios).forEach((key) => {
        const scenario = scenarios[key];
        const card = document.createElement("div");
        card.className = "scenario-card";

        card.innerHTML = `
            <div class="scenario-emoji">${emojiMap[key]}</div>
            <div class="scenario-info">
                <h3>${scenario.name}</h3>
                <p>${scenario.description[appState.fault]}</p>
            </div>
        `;

        card.addEventListener("click", () => {
            appState.scenario = key;
            selectScenario(key);
        });

        grid.appendChild(card);
    });
}

function selectScenario(scenarioKey) {
    const scenario = scenarios[scenarioKey];
    const storyText = document.getElementById("story-text");

    const stories = scenario.stories[appState.fault];
    const randomStory =
        stories[Math.floor(Math.random() * stories.length)].replace(
            "{friend}",
            appState.friendName,
        );

    appState.currentStory = randomStory;
    storyText.textContent = randomStory;
    showStep("story-step");
}

function updateToxicityDisplay(value) {
    appState.toxicity = parseInt(value);

    const toxicityValue = document.getElementById("toxicity-value");
    if (toxicityValue) {
        toxicityValue.textContent = value;
    }
    
    const toxicityBadge = document.getElementById("toxicity-badge");
    if (toxicityBadge) {
        toxicityBadge.textContent = value;
    }
    
    const dropdownBadge = document.getElementById("dropdown-toxicity-badge");
    if (dropdownBadge) {
        dropdownBadge.textContent = value;
    }

    const emoji = document.getElementById("toxicity-emoji-big");
    const label = document.getElementById("toxicity-label");

    if (emoji && label) {
        if (value < 20) {
            emoji.textContent = "😊";
            label.textContent = "Chill & Understanding";
        } else if (value < 40) {
            emoji.textContent = "😐";
            label.textContent = "Slightly Annoyed";
        } else if (value < 60) {
            emoji.textContent = "😕";
            label.textContent = "Moderately Upset";
        } else if (value < 80) {
            emoji.textContent = "😤";
            label.textContent = "Really Frustrated";
        } else {
            emoji.textContent = "😡";
            label.textContent = "Extremely Toxic";
        }
    }
}

function applyMoodTheme(mood) {
    document.body.classList.remove("mood-peaceful", "mood-tense", "mood-chaotic");

    if (mood === "improving" || mood === "peaceful") {
        document.body.classList.add("mood-peaceful");
    } else if (mood === "heated" || mood === "chaotic") {
        document.body.classList.add("mood-chaotic");
    } else {
        document.body.classList.add("mood-tense");
    }
}



function getFirstMessage() {
    const scenario = scenarios[appState.scenario];
    const messages = scenario.firstMessages[appState.fault];
    return messages[Math.floor(Math.random() * messages.length)];
}

function startNewChat() {
    showStep("chat-step");

    updateChatAvatar();
    document.getElementById("chat-friend-name").textContent =
        appState.friendName;
    document.getElementById("dropdown-toxicity-badge").textContent = appState.toxicity;
    
    const dropdownBadge = document.getElementById("dropdown-toxicity-badge");
    if (dropdownBadge) {
        dropdownBadge.textContent = appState.toxicity;
    }

    const storyBanner = document.getElementById("story-banner");
    const storyBannerText = document.getElementById("story-banner-text");
    storyBannerText.textContent = appState.currentStory;
    storyBanner.style.display = "None";

    const messagesContainer = document.getElementById("chat-messages");
    messagesContainer.innerHTML = "";
    syncChatScrollState({ container: messagesContainer });

    appState.currentChatMessages = [];
    appState.messageCount = 0;
    appState.conversationMood = "tense";
    appState.escalationLevel = 0;
    appState.apologyDetected = false;
    appState.currentChatId = Date.now();
    
    setTimeout(() => {
        sendFriendMessage(getFirstMessage());
    }, 0);

    const chatInput = document.getElementById("chat-input");
    if (chatInput) {
        chatInput.value = "";
        if (typeof updateSendVoiceButton === "function") {
            updateSendVoiceButton();
        }
    }
}

// Function to disable send and voice buttons while waiting for AI response
function disableChatButtons() {
    const sendBtn = document.getElementById("send-btn");
    const voiceBtn = document.getElementById("voice-btn");
    
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.opacity = "0.5";
        sendBtn.style.cursor = "not-allowed";
        sendBtn.style.pointerEvents = "none";
    }
    
    if (voiceBtn) {
        voiceBtn.disabled = true;
        voiceBtn.style.opacity = "0.5";
        voiceBtn.style.cursor = "not-allowed";
        voiceBtn.style.pointerEvents = "none";
    }
}

// Function to enable send and voice buttons after AI response
function enableChatButtons() {
    const sendBtn = document.getElementById("send-btn");
    const voiceBtn = document.getElementById("voice-btn");
    const chatInput = document.getElementById("chat-input");
    
    if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.opacity = "1";
        sendBtn.style.cursor = "pointer";
        sendBtn.style.pointerEvents = "auto";
    }
    
    if (voiceBtn) {
        voiceBtn.disabled = false;
        voiceBtn.style.opacity = "1";
        voiceBtn.style.cursor = "pointer";
        voiceBtn.style.pointerEvents = "auto";
    }
    
    // Update send/voice button visibility based on input content
    if (typeof updateSendVoiceButton === "function") {
        updateSendVoiceButton();
    }
    
    // Keep input focused if it has text
    if (chatInput && chatInput.value.trim().length > 0) {
        chatInput.focus();
    }
}

async function sendMessage() {
    const input = document.getElementById("chat-input");
    const sendBtn = document.getElementById("send-btn");
    const message = input.value.trim();

    if (!message) return;
    
    // Safety check: don't send if buttons are already disabled (waiting for response)
    if (sendBtn && sendBtn.disabled) {
        return;
    }

    // Disable buttons to prevent spamming
    disableChatButtons();

    addMessageToChat("user", message);
    appState.currentChatMessages.push({ sender: "user", text: message });
    appState.messageCount++;

    input.value = "";
    if (typeof updateSendVoiceButton === "function") {
        updateSendVoiceButton();
    }

    analyzeUserEmotion(message);

    setTimeout(() => {
        showTypingIndicator();
        generateFriendResponse(message)
            .then((response) => {
                hideTypingIndicator();
                sendFriendMessage(response);
                // Re-enable buttons after friend's response
                enableChatButtons();
            })
            .catch((error) => {
                hideTypingIndicator();
                sendFriendMessage(
                    "I... I don't know what to say right now.",
                );
                // Re-enable buttons even on error
                enableChatButtons();
            });
    }, 500);
}

function sendFriendMessage(message) {
    addMessageToChat("friend", message);
    appState.currentChatMessages.push({ sender: "friend", text: message });
}

function syncChatScrollState(options = {}) {
    const {
        container = document.getElementById("chat-messages"),
        forceScroll = false,
    } = options;
    
    if (!container) return;
    
    const overflowThreshold = 1;
    const isOverflowing = (container.scrollHeight - container.clientHeight) > overflowThreshold;
    
    container.classList.toggle("chat-scrollable", isOverflowing);
    
    if (isOverflowing || forceScroll) {
        const previousBehavior = container.style.scrollBehavior;
        container.style.scrollBehavior = "auto";
        container.scrollTop = container.scrollHeight;
        requestAnimationFrame(() => {
            container.style.scrollBehavior = previousBehavior;
        });
    }
}

function addMessageToChat(sender, text) {
    const messagesContainer = document.getElementById("chat-messages");

    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${sender}`;

    const bubbleDiv = document.createElement("div");
    bubbleDiv.className = "message-bubble";
    bubbleDiv.textContent = text;

    messageDiv.appendChild(bubbleDiv);
    messagesContainer.appendChild(messageDiv);

    syncChatScrollState({ container: messagesContainer });
}

function analyzeUserEmotion(message) {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.match(/sorry|apologize|my fault|my bad|i'm wrong/)) {
        appState.apologyDetected = true;
        appState.userEmotion = "apologetic";
    } else if (
        lowerMessage.match(/calm|understand|see your point|you're right/)
    ) {
        appState.userEmotion = "calm";
    } else if (
        lowerMessage.match(/whatever|don't care|shut up|screw you|you're wrong/)
    ) {
        appState.userEmotion = "aggressive";
        appState.escalationLevel++;
    } else {
        appState.userEmotion = "neutral";
    }
}

async function generateFriendResponse(userMessage) {
    try {
        const scenario = scenarios[appState.scenario];
        const toxicity = appState.toxicity;

        const conversationContext = appState.currentChatMessages
            .slice(-6)
            .map((msg) => {
                const speaker =
                    msg.sender === "user"
                        ? appState.userName
                        : appState.friendName;
                return `${speaker}: ${msg.text}`;
            })
            .join("\n");

        let toxicityLevel = "calm and understanding";
        if (toxicity >= 80) toxicityLevel = "extremely upset, toxic, and dramatic";
        else if (toxicity >= 60) toxicityLevel = "very frustrated and confrontational";
        else if (toxicity >= 40) toxicityLevel = "moderately upset and annoyed";
        else if (toxicity >= 20) toxicityLevel = "slightly annoyed but controlled";

        const systemPrompt = `You are ${appState.friendName}, ${appState.gender === "male" ? "a male" : "a female"} friend in a conversation. 

CONTEXT: ${scenario.systemContext[appState.fault]}

STORY BACKGROUND: ${appState.currentStory}

YOUR EMOTIONAL STATE: You are ${toxicityLevel}. 

YOUR PERSONALITY BASED ON TOXICITY (${toxicity}/100):
${toxicity >= 70 ? "- Use manipulation tactics like guilt-tripping, blame-shifting, and passive aggression\n- Be dramatic and make everything about your feelings\n- Bring up past issues\n- Use phrases like 'you always', 'you never', 'after everything I did for you'" : ""}
${toxicity >= 40 && toxicity < 70 ? "- Show clear disappointment and frustration\n- Be direct but sometimes passive-aggressive\n- Make your hurt feelings known" : ""}
${toxicity < 40 ? "- Be more understanding but still express your feelings\n- Be willing to listen\n- Show some empathy while maintaining your perspective" : ""}

IMPORTANT RULES:
- Keep responses SHORT (1-3 sentences maximum)
- Never reference that you're an AI
- Stay completely in character as ${appState.friendName}
- React naturally to what ${appState.userName} says
- Build on the conversation history
- Make EVERY response unique and contextual - never repeat yourself
- Let the conversation evolve naturally based on ${appState.userName}'s responses

CONVERSATION SO FAR:
${conversationContext}

${appState.userName}: ${userMessage}

Respond ONLY as ${appState.friendName}, keeping it natural, conversational, and matching your toxicity level of ${toxicity}/100. Generate a unique response that fits this specific conversation moment.`;

        const requestBody = {
            contents: [
                {
                    parts: [
                        {
                            text: systemPrompt,
                        },
                    ],
                },
            ],
            generationConfig: {
                temperature: 0.9,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 500,
            },
        };

        const response = await fetch("https://toxicfriendbackend-2.onrender.com/api", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ requestBody }),
        });

        if (!response.ok) {
            throw new Error("Backend API error");
        }

        const data = await response.json();

        let generatedText = "";
        
        if (data.success && data.message) {
            generatedText = data.message.trim();
        } else if (
            data.candidates &&
            data.candidates[0] &&
            data.candidates[0].content &&
            data.candidates[0].content.parts &&
            data.candidates[0].content.parts[0]
        ) {
            generatedText = data.candidates[0].content.parts[0].text.trim();
        } else {
            throw new Error(data.error || "Invalid response format from API");
        }

        if (generatedText) {

            const lowerMessage = userMessage.toLowerCase();
            if (lowerMessage.match(/sorry|apologize|my fault|my bad/)) {
                if (toxicity < 40) {
                    appState.conversationMood = "improving";
                    applyMoodTheme("improving");
                } else if (toxicity >= 70) {
                    appState.escalationLevel++;
                    appState.conversationMood = "heated";
                    applyMoodTheme("heated");
                }
            }

            if (lowerMessage.match(/but|however|actually|you also|what about/)) {
                appState.escalationLevel++;
                if (toxicity > 60) {
                    appState.conversationMood = "heated";
                    applyMoodTheme("heated");
                }
            }

            return generatedText;
        }
        throw new Error("Invalid response format from API");
    } catch (error) {
        throw error;
    }
}

function resetConversationState() {
    appState.currentChatMessages = [];
    appState.messageCount = 0;
    appState.conversationMood = "tense";
    appState.escalationLevel = 0;
    appState.apologyDetected = false;
    appState.userEmotion = "neutral";
    appState.currentChatId = null;
    appState.currentStory = "";
    appState.isFromHistory = false;
    appState.toxicity = 50;

    updateToxicityDisplay(50);
    
    const mainToxicitySlider = document.getElementById("toxicity-slider");
    if (mainToxicitySlider) {
        mainToxicitySlider.value = 50;
    }
    
    const modalToxicitySlider = document.getElementById("modal-toxicity-slider");
    if (modalToxicitySlider) {
        modalToxicitySlider.value = 50;
    }
    
    updateModalToxicityDisplay(50);
    updateToxicityBackground(50);
    applyMoodTheme("tense");
}

function saveToLocalStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
    }
}

function getFromLocalStorage(key) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    } catch (e) {
        return null;
    }
}

function saveCurrentChat() {
    if (appState.messageCount === 0) return;

    const chatHistory = getFromLocalStorage("chatHistory") || [];
    const chatId = appState.currentChatId || Date.now();

    if (!appState.currentChatId) {
        appState.currentChatId = chatId;
    }

    const newChat = {
        id: chatId,
        date: new Date().toISOString(),
        scenario: scenarios[appState.scenario].name,
        friendName: appState.friendName,
        gender: appState.gender,
        fault: appState.fault,
        toxicity: appState.toxicity,
        messageCount: appState.messageCount,
        mood: appState.conversationMood,
        messages: appState.currentChatMessages,
        story: appState.currentStory,
    };

    const existingIndex = chatHistory.findIndex(chat => chat.id === chatId);
    if (existingIndex !== -1) {
        chatHistory[existingIndex] = newChat;
    } else {
        chatHistory.unshift(newChat);
        if (chatHistory.length > 20) {
            chatHistory.pop();
        }
    }

    saveToLocalStorage("chatHistory", chatHistory);
    loadChatHistory();
}

const RELATIVE_TIME_DIVISIONS = [
    { amount: 60, name: "second" },
    { amount: 60, name: "minute" },
    { amount: 24, name: "hour" },
    { amount: 7, name: "day" },
    { amount: 4.34524, name: "week" },
    { amount: 12, name: "month" },
    { amount: Infinity, name: "year" }
];

const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function formatRelativeTime(date) {
    let duration = (date.getTime() - Date.now()) / 1000;

    for (const division of RELATIVE_TIME_DIVISIONS) {
        if (Math.abs(duration) < division.amount) {
            return relativeTimeFormatter.format(Math.round(duration), division.name);
        }
        duration /= division.amount;
    }

    return relativeTimeFormatter.format(0, "second");
}

function loadChatHistory() {
    const chatHistory = getFromLocalStorage("chatHistory") || [];
    const historyList = document.querySelector("#sidebar-content .history-list");
    if (!historyList) return;

    historyList.innerHTML = "";

    if (chatHistory.length === 0) {
        const emptyState = document.createElement("p");
        emptyState.className = "no-chats";
        emptyState.innerHTML = `
            <span class="no-chats-name">${appState.userName || "You"}</span>
            <span class="no-chats-detail">haven't saved any chats yet.</span>
            <span class="no-chats-subtext">Start a new conversation to build your library.</span>
        `;
        historyList.appendChild(emptyState);
        updateNoChatsMessage();
        return;
    }

    chatHistory.forEach((chat, index) => {
        const chatItem = document.createElement("div");
        chatItem.className = "chat-history-item";

        const date = new Date(chat.date);
        const relativeTime = formatRelativeTime(date);

        const moodLabel = (chat.mood || "neutral").replace(/\b\w/g, (c) => c.toUpperCase());
        const faultLabel = chat.fault === "them" ? "Their Fault" : "Your Fault";

        chatItem.innerHTML = `
            <h3>${chat.scenario} with ${chat.friendName}</h3>
            <p>${relativeTime} • ${chat.messageCount || 0} messages</p>
            <div class="history-meta-line">
                <div class="history-meta-item">
                    <span class="history-meta-label">Toxicity</span>
                    <span class="history-meta-value">${chat.toxicity || 0}</span>
                </div>
                <div class="history-meta-item">
                    <span class="history-meta-label">Mood</span>
                    <span class="history-meta-value">${moodLabel}</span>
                </div>
                <div class="history-meta-item">
                    <span class="history-meta-label">Fault</span>
                    <span class="history-meta-value">${faultLabel}</span>
                </div>
            </div>
        `;

        if (index >= 5) {
            chatItem.classList.add("older-chat", "chat-history-hidden");
        }

        chatItem.addEventListener("click", () => {
            viewSavedChat(chat);
        });

        historyList.appendChild(chatItem);
    });

    if (chatHistory.length > 5) {
        const toggleButton = document.createElement("button");
        toggleButton.type = "button";
        toggleButton.className = "history-toggle-btn";
        toggleButton.innerHTML = `<span>Show older chats <span class="history-toggle-icon">▸</span></span>`;

        toggleButton.addEventListener("click", (event) => {
            event.stopPropagation();
            const olderItems = historyList.querySelectorAll(".older-chat");
            const isShowing = toggleButton.classList.toggle("expanded");

            olderItems.forEach((item) => {
                item.classList.toggle("chat-history-hidden", !isShowing);
            });

            const label = isShowing ? "Hide older chats" : "Show older chats";
            const icon = isShowing ? "▾" : "▸";
            toggleButton.innerHTML = `<span>${label} <span class="history-toggle-icon">${icon}</span></span>`;
        });

        historyList.appendChild(toggleButton);
    }
}

function viewSavedChat(chat) {
    const sidebar = document.getElementById("left-sidebar");
    if (sidebar.classList.contains("mobile-open")) {
        sidebar.classList.remove("mobile-open");
    }

    showStep("chat-step");

    document.getElementById("chat-friend-name").textContent = chat.friendName;

    const storyBanner = document.getElementById("story-banner");
    const storyBannerText = document.getElementById("story-banner-text");
    storyBannerText.textContent = chat.story;
    storyBanner.style.display = "none"; // Hide story banner by default - user must click "View Story" to show it
    storyBanner.classList.add("collapsed");

    const messagesContainer = document.getElementById("chat-messages");
    messagesContainer.innerHTML = "";
    syncChatScrollState({ container: messagesContainer });
    
    insertSceneIntro(chat.scenario);

    chat.messages.forEach((msg) => {
        addMessageToChat(msg.sender, msg.text);
    });

    appState.currentChatMessages = chat.messages;
    appState.messageCount = chat.messageCount;
    appState.conversationMood = chat.mood;
    appState.currentChatId = chat.id;
    appState.currentStory = chat.story;
    appState.isFromHistory = true;
    appState.gender = chat.gender || inferGenderFromName(chat.friendName);
    appState.friendName = chat.friendName;
    updateChatAvatar(appState.gender);
    appState.scenario = Object.keys(scenarios).find(key => scenarios[key].name === chat.scenario) || "ignored";
    appState.fault = chat.fault || "you";
    appState.toxicity = chat.toxicity;

    
    const toxicityBadge = document.getElementById("toxicity-badge");
    if (toxicityBadge) {
        toxicityBadge.textContent = chat.toxicity;
    }
    
    const dropdownBadge = document.getElementById("dropdown-toxicity-badge");
    if (dropdownBadge) {
        dropdownBadge.textContent = chat.toxicity;
    }
    
    // Update story button text to reflect hidden state
    if (typeof window.updateStoryButtonText === 'function') {
        window.updateStoryButtonText();
    }
}

function showChatReview() {
    if (appState.messageCount === 0) {
        alert("No messages to review yet!");
        return;
    }

    showStep("review-step");

    document.getElementById("review-messages").textContent =
        appState.messageCount;
    document.getElementById("review-mood").textContent =
        appState.conversationMood.charAt(0).toUpperCase() +
        appState.conversationMood.slice(1);

    const handlingScore = calculateHandlingScore();
    document.getElementById("review-handling").textContent =
        handlingScore + "%";

    const feedbackDiv = document.getElementById("review-feedback");
    feedbackDiv.innerHTML = `
        <h4 style="margin-bottom: 1rem;">Your Performance</h4>
        <p><strong>Scenario:</strong> ${scenarios[appState.scenario].name}</p>
        <p><strong>Friend:</strong> ${appState.friendName}</p>
        <p><strong>Messages Sent:</strong> ${appState.messageCount}</p>
        <p><strong>Your Emotion:</strong> ${appState.userEmotion}</p>
        <p><strong>Apology Detected:</strong> ${appState.apologyDetected ? "Yes" : "No"}</p>
        <p><strong>Escalation Level:</strong> ${appState.escalationLevel}</p>
        <hr style="margin: 1rem 0; opacity: 0.3;">
        <p>${generateFeedback(handlingScore)}</p>
    `;
}

function calculateHandlingScore() {
    let score = 50;

    if (appState.apologyDetected) score += 20;
    if (appState.conversationMood === "improving") score += 20;
    if (appState.conversationMood === "heated") score -= 15;

    score -= appState.escalationLevel * 5;

    if (appState.userEmotion === "calm") score += 10;
    if (appState.userEmotion === "apologetic") score += 15;
    if (appState.userEmotion === "aggressive") score -= 20;

    return Math.max(0, Math.min(100, score));
}

function generateFeedback(score) {
    if (score >= 80) {
        return `Excellent job! You handled this situation with grace and maturity. You stayed calm, communicated effectively, and worked toward resolution. Keep it up!`;
    } else if (score >= 60) {
        return `Good effort! You managed to navigate this tricky situation reasonably well. There's room for improvement in staying calm and avoiding escalation, but you're on the right track.`;
    } else if (score >= 40) {
        return `Not bad, but there's definitely room for improvement. Try to stay calmer next time, apologize when appropriate, and avoid defensive or aggressive responses.`;
    } else {
        return `This conversation could have gone better. Focus on keeping your cool, listening actively, and responding thoughtfully rather than reactively. Remember, staying calm is key!`;
    }
}

let isAnalyzing = false;

function toggleAnalysisLoading(isLoading) {
    const overlay = document.getElementById("analysis-loading");
    const results = document.getElementById("analysis-results");
    const modalBody = document.getElementById("analyzer-modal-body");
    if (modalBody) {
        modalBody.classList.toggle("locked", isLoading);
        if (isLoading) {
            modalBody.scrollTop = 0;
        }
    }
    if (!overlay || !results) return;
    overlay.classList.toggle("active", isLoading);
    results.classList.toggle("blurred", isLoading);
}

async function analyzeMessage() {
    if (isAnalyzing) return;
    const input = document.getElementById("analyzer-input");
    const text = input.value.trim();

    if (!text) {
        alert("Please enter a message to analyze!");
        return;
    }
    isAnalyzing = true;

    const modal = document.getElementById("analyzer-modal");
    modal.classList.add("active");

    const analyzedTextDiv = document.getElementById("analyzed-text");
    const manipulationListDiv = document.getElementById("manipulation-list");
    const scoreDiv = document.getElementById("analyzer-score");
    const scoreRing = document.getElementById("score-ring-progress");
    const interpretationDiv = document.getElementById("score-interpretation");
    toggleAnalysisLoading(true);

    analyzedTextDiv.innerHTML =
        '<p style="text-align: center; color: var(--text-secondary);">Analyzing...</p>';
    manipulationListDiv.innerHTML = "";

    try {
        const analysis = await analyzeTextForManipulation(text);

        scoreDiv.textContent = analysis.toxicityScore + "%";

        const circumference = 2 * Math.PI * 52;
        const offset =
            circumference - (analysis.toxicityScore / 100) * circumference;
        scoreRing.style.strokeDashoffset = offset;

        let interpretation = "";
        let interpretationClass = "";
        if (analysis.toxicityScore < 20) {
            interpretation =
                "<h4>Healthy Communication</h4><p>This message appears to be straightforward and respectful.</p>";
            interpretationClass = "low";
        } else if (analysis.toxicityScore < 50) {
            interpretation =
                "<h4>Mild Concerns</h4><p>Some potentially manipulative elements detected, but mostly acceptable communication.</p>";
            interpretationClass = "medium";
        } else if (analysis.toxicityScore < 75) {
            interpretation =
                "<h4>Moderate Toxicity</h4><p>Multiple manipulation tactics detected. Proceed with caution.</p>";
            interpretationClass = "high";
        } else {
            interpretation =
                "<h4>High Toxicity</h4><p>Severe manipulation patterns detected. This communication style is unhealthy.</p>";
            interpretationClass = "high";
        }
        interpretationDiv.innerHTML = interpretation;

        analyzedTextDiv.innerHTML = analysis.highlightedText;

        if (
            analysis.tactics.length === 0 ||
            (analysis.tactics.length === 1 &&
                analysis.tactics[0].name === "No Manipulation Detected")
        ) {
            manipulationListDiv.innerHTML = `
                <div class="no-tactics-message">
                    <div class="icon">✅</div>
                    <h4>No Manipulation Detected</h4>
                    <p>This message appears to be straightforward communication without manipulative tactics.</p>
                </div>
            `;
        } else {
            analysis.tactics.forEach((tactic, index) => {
                const tacticCard = document.createElement("div");
                tacticCard.className = `manipulation-card manipulation-item severity-${tactic.severity}`;
                tacticCard.style.animationDelay = `${index * 0.1}s`;
                const tacticType = tactic.name.toLowerCase().replace(/[^a-z]/g, '');
                tacticCard.dataset.type = tacticType;

                tacticCard.innerHTML = `
                    <div class="manipulation-item-header">
                        <div class="manipulation-icon">${tactic.icon}</div>
                        <div class="manipulation-title-group">
                            <div class="manipulation-title">${tactic.name}</div>
                            <div class="manipulation-severity" style="color: ${tactic.severity === 'high' ? '#ff4365' : tactic.severity === 'medium' ? '#ffd93d' : '#06ffa5'}">${tactic.severity.toUpperCase()} SEVERITY</div>
                        </div>
                    </div>
                    <div class="manipulation-description">${tactic.description}</div>
                    ${
                        tactic.examples && tactic.examples.length > 0
                            ? `
                        <div class="manipulation-examples">
                            <div class="manipulation-examples-title">Examples Found</div>
                            <div class="manipulation-examples-text">${tactic.examples.map((ex) => `"${ex}"`).join('<br><br>')}</div>
                        </div>
                    `
                            : ""
                    }
                `;

                manipulationListDiv.appendChild(tacticCard);
            });
        }
    } catch (error) {
        analyzedTextDiv.innerHTML =
            '<p style="text-align: center; color: var(--accent);">Error analyzing message. Please try again.</p>';
    } finally {
        isAnalyzing = false;
        toggleAnalysisLoading(false);
    }
}

async function analyzeTextForManipulation(text) {
    try {
        const systemPrompt = `Analyze the following message for toxic and manipulative communication patterns. Identify specific manipulation tactics and calculate an overall toxicity score (0-100).

Message to analyze: "${text}"

Provide your analysis in this format:
1. Overall toxicity score (0-100)
2. List of specific manipulation tactics found (gaslighting, guilt-tripping, victim-playing, passive-aggression, blame-shifting, etc.)
3. For each tactic, identify the specific text segments and explain why

Return as JSON with this structure:
{
  "toxicity_score": number,
  "manipulations": [
    {
      "type": "Manipulation Type",
      "severity": "high/medium/low",
      "explanation": "Why this is manipulative",
      "segments": ["specific text from message"]
    }
  ],
  "segments": [
    {
      "text": "specific quote",
      "manipulation_type": "type",
      "reason": "explanation"
    }
  ]
}`;

        const requestBody = {
            contents: [
                {
                    parts: [
                        {
                            text: systemPrompt,
                        },
                    ],
                },
            ],
            generationConfig: {
                temperature: 0.3,
                topK: 20,
                topP: 0.8,
                maxOutputTokens: 1000,
            },
        };

        const response = await fetch("https://toxicfriendbackend-2.onrender.com/api", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ requestBody }),
        });

        if (!response.ok) {
            throw new Error("Backend API error");
        }

        const data = await response.json();

        let analysisText = "";
        if (data.success && data.message) {
            analysisText = data.message.trim();
        } else if (
            data.candidates &&
            data.candidates[0] &&
            data.candidates[0].content &&
            data.candidates[0].content.parts &&
            data.candidates[0].content.parts[0]
        ) {
            analysisText = data.candidates[0].content.parts[0].text.trim();
        }

        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        let parsedData;
        if (jsonMatch) {
            parsedData = JSON.parse(jsonMatch[0]);
        } else {
            parsedData = {
                toxicity_score: 0,
                manipulations: [],
                segments: [],
            };
        }

        let highlightedText = text;
        const manipulationColors = {
            gaslighting: "#9d4edd",
            "guilt-tripping": "#e63946",
            "guilt tripping": "#e63946",
            "victim-playing": "#f77f00",
            "victim playing": "#f77f00",
            "silent-treatment": "#06aed5",
            "silent treatment": "#06aed5",
            "love-bombing": "#ff006e",
            "love bombing": "#ff006e",
            "passive-aggression": "#fb5607",
            "passive aggression": "#fb5607",
            "blame-shifting": "#e63946",
            "blame shifting": "#e63946",
            minimization: "#ffbe0b",
            generalization: "#8338ec",
            "conditional-affection": "#ff006e",
            "conditional affection": "#ff006e",
            "veiled-threats": "#d62828",
            "veiled threats": "#d62828",
            "false-consensus": "#4895ef",
            "false consensus": "#4895ef",
            urgency: "#fb5607",
            pressure: "#fb5607",
            "urgency/pressure": "#fb5607",
            "urgency-pressure": "#fb5607",
        };

        if (parsedData.segments && parsedData.segments.length > 0) {
            // Track which text segments have already been highlighted to avoid duplicates
            const processedSegments = new Set();
            const segmentsToProcess = [...parsedData.segments];
            
            // Sort by length (longest first) to prioritize longer, more specific matches
            segmentsToProcess.sort((a, b) => b.text.length - a.text.length);
            
            segmentsToProcess.forEach((segment) => {
                const segmentText = segment.text.trim();
                if (!segmentText) return;
                
                // Create a normalized key (case-insensitive) to identify duplicate text
                const normalizedKey = segmentText.toLowerCase();
                
                // Skip if this exact text has already been processed
                if (processedSegments.has(normalizedKey)) {
                    return;
                }
                
                // Mark this segment as processed
                processedSegments.add(normalizedKey);
                
                const color =
                    manipulationColors[
                        segment.manipulation_type.toLowerCase()
                    ] || "#ff3366";
                const replacement = `<mark class="highlight-segment" style="background-color: ${color}33; border-bottom: 2px solid ${color}; padding: 2px 4px; border-radius: 3px; cursor: help; color: var(--text-primary);" title="${segment.manipulation_type}: ${segment.reason}">${segment.text}</mark>`;

                const escapedText = segmentText.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&",
                );
                
                // Only replace if the text hasn't been replaced yet
                // Check if the original text still exists (not already wrapped in mark tags)
                const regex = new RegExp(escapedText, "gi");
                if (regex.test(highlightedText)) {
                    // Replace only the first occurrence that's not already in a tag
                    highlightedText = highlightedText.replace(regex, (match, offset, string) => {
                        // Check if we're already inside a mark tag by looking backwards
                        const beforeText = string.substring(0, offset);
                        const lastMarkOpen = beforeText.lastIndexOf('<mark');
                        const lastMarkClose = beforeText.lastIndexOf('</mark>');
                        
                        // If there's an open mark tag without a close, we're inside a tag
                        if (lastMarkOpen > lastMarkClose) {
                            return match; // Don't replace, already highlighted
                        }
                        
                        return replacement;
                    });
                }
            });
        }

        const tactics = parsedData.manipulations || [];
        const formattedTactics = tactics.map((manip) => ({
            name: manip.type,
            description: manip.explanation || manip.description || "",
            examples: manip.segments || [],
            icon: getManipulationIcon(manip.type),
            severity: manip.severity || "medium",
            color: manipulationColors[manip.type.toLowerCase()] || "#ff3366",
        }));

        return {
            highlightedText: `<p style="line-height: 1.8; font-size: 1rem;">${highlightedText}</p>`,
            tactics:
                formattedTactics.length > 0
                    ? formattedTactics
                    : [
                          {
                              name: "No Manipulation Detected",
                              description:
                                  "This message appears to be straightforward communication.",
                              icon: "✅",
                              severity: "low",
                          },
                      ],
            toxicityScore: parsedData.toxicity_score || 0,
        };
    } catch (error) {
        throw new Error(
            "Unable to connect to backend API. Please ensure your backend server is running and accessible.",
        );
    }
}

function getManipulationIcon(type) {
    const icons = {
        gaslighting: "🌀",
        "guilt tripping": "😔",
        "guilt-tripping": "😔",
        "victim playing": "🎭",
        "victim-playing": "🎭",
        "silent treatment": "🤐",
        "silent-treatment": "🤐",
        "love bombing": "💖",
        "love-bombing": "💖",
        "passive aggression": "😒",
        "passive-aggression": "😒",
        "blame shifting": "👉",
        "blame-shifting": "👉",
        minimization: "🤏",
        generalization: "📊",
        "conditional affection": "💔",
        "conditional-affection": "💔",
        "veiled threats": "⚠️",
        "veiled-threats": "⚠️",
        "false consensus": "👥",
        "false-consensus": "👥",
        urgency: "⏰",
        pressure: "⏰",
        "urgency/pressure": "⏰",
        "urgency-pressure": "⏰",
    };
    return icons[type.toLowerCase()] || "🔍";
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

// Additional functionality for new sidebar
function setupNewSidebarHandlers() {
    const menuBtn = document.getElementById("menu-btn");
    if (menuBtn) {
        menuBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const sidebar = document.getElementById("left-sidebar");
            sidebar.classList.toggle("mobile-open");
        });
    }

    document.addEventListener("click", (e) => {
        const sidebar = document.getElementById("left-sidebar");
        const menuBtn = document.getElementById("menu-btn");
        
        if (sidebar && sidebar.classList.contains("mobile-open") && 
            !sidebar.contains(e.target) && 
            !menuBtn.contains(e.target)) {
            sidebar.classList.remove("mobile-open");
        }
    });
}

setupNewSidebarHandlers();

// Mobile Keyboard Handling - Visual Viewport API
function setupMobileKeyboardHandling() {
    if (!('visualViewport' in window)) {
        return;
    }

    const chatWrapper = document.querySelector('.chat-wrapper');
    const chatInputBar = document.querySelector('.chat-input-bar');
    const chatMessages = document.querySelector('.chat-messages');
    const chatStep = document.getElementById('chat-step');

    if (!chatWrapper || !chatInputBar || !chatMessages) {
        return;
    }

    const visualViewport = window.visualViewport;

    if (mobileKeyboardUpdateHandler) {
        visualViewport.removeEventListener('resize', mobileKeyboardUpdateHandler);
        visualViewport.removeEventListener('scroll', mobileKeyboardUpdateHandler);
    }

    let pendingUpdate = false;

    function updateViewport() {
        if (pendingUpdate) return;
        pendingUpdate = true;

        requestAnimationFrame(() => {
            pendingUpdate = false;

            const viewport = window.visualViewport;
            if (!viewport) {
                return;
            }

            const viewportHeight = viewport.height;
            const windowHeight = window.innerHeight;

            const offset = Math.max(0, windowHeight - viewportHeight);

            if (offset > 100) {
                chatInputBar.style.transform = `translateY(-${offset}px)`;
                chatMessages.style.paddingBottom = `${offset + 80}px`;
                chatWrapper.style.height = `${viewportHeight}px`;
                chatWrapper.style.maxHeight = `${viewportHeight}px`;
                chatWrapper.style.overflow = 'hidden';
                
                if (chatStep) {
                    chatStep.style.height = `${viewportHeight}px`;
                    chatStep.style.maxHeight = `${viewportHeight}px`;
                    chatStep.style.overflow = 'hidden';
                }
                
                setTimeout(() => {
                    syncChatScrollState({ container: chatMessages, forceScroll: true });
                }, 100);
            } else {
                chatInputBar.style.transform = 'translateY(0)';
                chatMessages.style.paddingBottom = '1.5rem';
                chatWrapper.style.height = '100dvh';
                chatWrapper.style.maxHeight = '100dvh';
                chatWrapper.style.overflow = 'hidden';
                
                if (chatStep) {
                    chatStep.style.height = '';
                    chatStep.style.maxHeight = '';
                    chatStep.style.overflow = 'hidden';
                }
                
                syncChatScrollState({ container: chatMessages });
            }
        });
    }

    mobileKeyboardUpdateHandler = updateViewport;
    visualViewport.addEventListener('resize', mobileKeyboardUpdateHandler);
    visualViewport.addEventListener('scroll', mobileKeyboardUpdateHandler);
    updateViewport();
}

// Chat Dropdown Menu Functionality
function setupChatDropdownMenu() {
    const menuBtn = document.getElementById('chat-menu-btn');
    const dropdownMenu = document.getElementById('chat-dropdown-menu');
    const dropdownReviewBtn = document.getElementById('dropdown-review-btn');
    const dropdownToxicityBtn = document.getElementById('dropdown-toxicity-btn');
    const dropdownStoryBtn = document.getElementById('dropdown-story-btn');
    const dropdownCloseBtn = document.getElementById('dropdown-close-btn');

    if (!menuBtn || !dropdownMenu) {
        return;
    }

    let isOpen = false;

    function openDropdown() {
        dropdownMenu.classList.add('show');
        menuBtn.setAttribute('aria-expanded', 'true');
        dropdownMenu.setAttribute('aria-hidden', 'false');
        isOpen = true;
        
        const firstItem = dropdownMenu.querySelector('.dropdown-item');
        if (firstItem) {
            setTimeout(() => firstItem.focus(), 50);
        }
    }

    function closeDropdown(restoreFocus = true) {
        dropdownMenu.classList.remove('show');
        menuBtn.setAttribute('aria-expanded', 'false');
        dropdownMenu.setAttribute('aria-hidden', 'true');
        isOpen = false;
        
        if (restoreFocus) {
            menuBtn.focus();
        }
    }

    function toggleDropdown() {
        if (isOpen) {
            closeDropdown();
        } else {
            openDropdown();
        }
    }

    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown();
    });

    document.addEventListener('click', (e) => {
        if (isOpen && !dropdownMenu.contains(e.target) && e.target !== menuBtn) {
            closeDropdown();
        }
    });

    dropdownMenu.addEventListener('focusout', () => {
        setTimeout(() => {
            const activeElement = document.activeElement;
            const movedToMenuButton = activeElement === menuBtn || menuBtn.contains(activeElement);
            if (isOpen && !dropdownMenu.contains(activeElement) && !movedToMenuButton) {
                closeDropdown(false);
            }
        }, 0);
    });

    menuBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleDropdown();
        } else if (e.key === 'Escape' && isOpen) {
            e.preventDefault();
            closeDropdown();
        } else if (e.key === 'ArrowDown' && !isOpen) {
            e.preventDefault();
            openDropdown();
        }
    });

    dropdownReviewBtn.addEventListener('click', () => {
        closeDropdown();
        showChatReview();
    });

    dropdownToxicityBtn.addEventListener('click', () => {
        closeDropdown();
    });

    function isStoryHidden() {
        const storyBanner = document.getElementById('story-banner');
        if (!storyBanner) return true;
        
        const displayHidden = storyBanner.style.display === 'none';
        const collapsed = storyBanner.classList.contains('collapsed');
        
        return displayHidden || collapsed;
    }
    
    function updateStoryButtonText() {
        const dropdownStoryText = document.querySelector('#dropdown-story-btn .dropdown-text');
        
        if (dropdownStoryText) {
            if (isStoryHidden()) {
                dropdownStoryText.textContent = 'View Story';
            } else {
                dropdownStoryText.textContent = 'Hide Story';
            }
        }
    }
    
    window.updateStoryButtonText = updateStoryButtonText;
    
    dropdownStoryBtn.addEventListener('click', () => {
        closeDropdown();
        const storyBanner = document.getElementById('story-banner');
        const storyBannerText = document.getElementById('story-banner-text');
        if (storyBanner && storyBannerText) {
            if (isStoryHidden()) {
                storyBanner.style.display = 'flex';
                storyBannerText.textContent = appState.currentStory;
                storyBanner.classList.remove('collapsed');
            } else {
                storyBanner.style.display = 'none';
            }
            
            updateStoryButtonText();
        }
    });
    
    menuBtn.addEventListener('click', () => {
        updateStoryButtonText();
    });

    dropdownCloseBtn.addEventListener('click', () => {
        closeDropdown();
        if (appState.messageCount > 0) {
            saveCurrentChat();
        }
        resetConversationState();
        showStep("gender-step");
    });

    const dropdownItems = dropdownMenu.querySelectorAll('.dropdown-item');
    dropdownItems.forEach((item, index) => {
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeDropdown();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextItem = dropdownItems[index + 1];
                if (nextItem) {
                    nextItem.focus();
                } else {
                    dropdownItems[0].focus();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevItem = dropdownItems[index - 1];
                if (prevItem) {
                    prevItem.focus();
                } else {
                    dropdownItems[dropdownItems.length - 1].focus();
                }
            } else if (e.key === 'Home') {
                e.preventDefault();
                dropdownItems[0].focus();
            } else if (e.key === 'End') {
                e.preventDefault();
                dropdownItems[dropdownItems.length - 1].focus();
            }
        });
    });
}

// Story Banner Collapse/Expand Functionality
function setupStoryBannerHandlers() {
    const storyBanner = document.getElementById('story-banner');
    const storyToggleBtn = document.getElementById('story-toggle-btn');
    const storyBannerHeader = document.getElementById('story-banner-header');

    if (!storyBanner || !storyToggleBtn) {
        return;
    }

    function toggleStoryBanner() {
        storyBanner.classList.toggle('collapsed');
        
        if (typeof window.updateStoryButtonText === 'function') {
            window.updateStoryButtonText();
        }
    }

    storyToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleStoryBanner();
    });

    storyBannerHeader.addEventListener('click', () => {
        toggleStoryBanner();
    });
}

// Initialize mobile features when chat step is active
const originalShowStep = showStep;
showStep = function(stepId) {
    originalShowStep(stepId);
    
    if (stepId === 'chat-step') {
        setTimeout(() => {
            setupMobileKeyboardHandling();
            setupStoryBannerHandlers();
            // Initialize emoji picker when chat step is shown
            initEmojiPicker();
            // Initialize chat input handlers (Enter key, send button, etc.)
            initChatInputHandlers();
            // Initialize toxicity adjuster when chat step is shown
            initToxicityAdjuster();
            // Ensure buttons are enabled when chat starts
            enableChatButtons();
        }, 100);
    }
};

function applyTheme(theme, options = {}) {
    if (!theme) return;
    
    const { persist = true } = options;
    
    appState.theme = theme;
    settingsSelectedTheme = theme;
    
    if (persist) {
        localStorage.setItem('userTheme', theme);
    }
    
    if (theme === "light") {
        document.body.classList.add("light");
    } else {
        document.body.classList.remove("light");
    }
    
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
        const themeIcon = themeToggleBtn.querySelector('.theme-icon');
        if (themeIcon) {
            themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
    }
    
    updateSettingsThemeButtons();
}

function hexToRgbString(hexColor) {
    if (!hexColor) return "255, 107, 107";
    let hex = hexColor.replace("#", "");
    if (hex.length === 3) {
        hex = hex.split("").map((char) => char + char).join("");
    }
    const value = parseInt(hex, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `${r}, ${g}, ${b}`;
}

function applyAccent(accentKey, options = {}) {
    const { persist = true, updateUI = true } = options;
    const preset = ACCENT_OPTIONS[accentKey] || ACCENT_OPTIONS.rose;
    
    if (!preset) return;
    
    appState.accent = accentKey || "rose";
    
    if (persist) {
        localStorage.setItem('userAccent', appState.accent);
    }
    
    const root = document.documentElement;
    const body = document.body;
    const rgbValue = preset.rgb || hexToRgbString(preset.color);
    
    // Set on root (for :root selector)
    root.style.setProperty('--accent', preset.color);
    root.style.setProperty('--accent-hover', preset.hover || preset.color);
    root.style.setProperty('--accent-rgb', rgbValue);
    
    // Also set on body to override body.light selector if needed
    body.style.setProperty('--accent', preset.color);
    body.style.setProperty('--accent-hover', preset.hover || preset.color);
    body.style.setProperty('--accent-rgb', rgbValue);
    
}

function updateThemeCardSelection(selectedTheme) {
    document.querySelectorAll(".theme-option-card").forEach((card) => {
        const isSelected = card.dataset.theme === selectedTheme;
        card.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
}

function updateThemeContinueState() {
    const continueBtn = document.getElementById("theme-continue-btn");
    if (!continueBtn) return;
    
    const ready = Boolean(appState.theme);
    continueBtn.classList.toggle("ready", ready);
    continueBtn.disabled = !ready;
}

function initThemePicker() {
    const themeStep = document.getElementById("theme-step");
    if (!themeStep) return;
    
    if (themeStep.dataset.initialized === "true") {
        updateThemeCardSelection(appState.theme);
        updateThemeContinueState();
        return;
    }
    
    const themeCards = themeStep.querySelectorAll(".theme-option-card");
    themeCards.forEach((card) => {
        card.addEventListener("click", () => {
            const selectedTheme = card.dataset.theme;
            applyTheme(selectedTheme);
            updateThemeCardSelection(selectedTheme);
            updateThemeContinueState();
        });
    });
    
    const continueBtn = document.getElementById("theme-continue-btn");
    if (continueBtn) {
        continueBtn.addEventListener("click", () => {
            if (continueBtn.disabled) return;
            localStorage.setItem('onboardingComplete', 'true');
            showStep("gender-step");
        });
    }
    
    updateThemeCardSelection(appState.theme);
    updateThemeContinueState();
    
    themeStep.dataset.initialized = "true";
}

// Theme toggle functionality
function setupThemeToggle() {
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
        const savedTheme = localStorage.getItem('userTheme') || 'dark';
        applyTheme(savedTheme, { persist: false });
        
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = appState.theme;
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(newTheme);
        });
    }
}

// ========== WELCOME FLOW LOGIC ==========

function initWelcomeFlow() {
    // Check if welcome flow has been completed
    const welcomeCompleted = localStorage.getItem('welcomeFlowCompleted');
    
    if (welcomeCompleted === 'true') {
        // Skip welcome flow
        return false;
    }
    
    // Show welcome flow
    let currentSlide = 1;
    const totalSlides = 3;
    
    function showSlide(slideNumber) {
        document.querySelectorAll('.welcome-slide').forEach(slide => {
            slide.classList.remove('active');
        });
        document.querySelectorAll('.welcome-dots .dot').forEach(dot => {
            dot.classList.remove('active');
        });
        
        const slideElement = document.getElementById(`slide-${slideNumber}`);
        const dotElement = document.querySelector(`.welcome-dots .dot[data-slide="${slideNumber}"]`);
        
        if (slideElement) slideElement.classList.add('active');
        if (dotElement) dotElement.classList.add('active');
    }
    
    function nextSlide() {
        if (currentSlide < totalSlides) {
            currentSlide++;
            showSlide(currentSlide);
        }
    }
    
    function skipWelcome() {
        localStorage.setItem('welcomeFlowCompleted', 'true');
        showStep('name-step');
    }
    
    // Next buttons
    document.querySelectorAll('.welcome-next').forEach(btn => {
        btn.addEventListener('click', nextSlide);
    });
    
    // Skip buttons
    document.querySelectorAll('.welcome-skip').forEach(btn => {
        btn.addEventListener('click', skipWelcome);
    });
    
    // Start button
    const startBtn = document.getElementById('welcome-start');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            localStorage.setItem('welcomeFlowCompleted', 'true');
            showStep('name-step');
        });
    }
    
    // Dot navigation
    document.querySelectorAll('.welcome-dots .dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const slideNum = parseInt(dot.dataset.slide);
            currentSlide = slideNum;
            showSlide(currentSlide);
        });
    });
    
    return true;
}

// ========== ENHANCED MESSAGE ANIMATIONS ==========

function addMessageWithAnimation(message, isUser) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'friend-message'}`;
    
    // Add typing indicator for friend messages
    if (!isUser) {
        showTypingIndicator();
        setTimeout(() => {
            hideTypingIndicator();
            renderMessage();
        }, 1000 + Math.random() * 1000);
    } else {
        renderMessage();
    }
    
    function renderMessage() {
        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="message-bubble">${message}</div>
                <div class="message-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
            </div>
        `;
        
        messagesContainer.appendChild(messageDiv);
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = 'translateY(20px)';
        
        requestAnimationFrame(() => {
            messageDiv.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            messageDiv.style.opacity = '1';
            messageDiv.style.transform = 'translateY(0)';
        });
        
        syncChatScrollState({ container: messagesContainer });
    }
}

// ========== ENHANCED MANIPULATION ANALYSIS ==========

function displayManipulationResults(tactics) {
    const manipulationList = document.getElementById('manipulation-list');
    if (!manipulationList) return;
    
    manipulationList.innerHTML = '';
    
    const tacticIcons = {
        'gaslighting': '🔄',
        'guilt': '😔',
        'victim': '😢',
        'silent': '🤐',
        'love': '💕',
        'passive': '😒',
        'minimize': '📉',
        'general': '📢',
        'threat': '⚠️',
        'consensus': '👥',
        'blame': '👉',
        'conditional': '🎭',
        'urgency': '⏰'
    };
    
    const severityColors = {
        'High': '#ff4365',
        'Medium': '#ffd93d',
        'Low': '#06ffa5'
    };
    
    tactics.forEach((tactic, index) => {
        const item = document.createElement('div');
        item.className = 'manipulation-item';
        item.dataset.type = tactic.type || 'general';
        item.style.animationDelay = `${index * 0.1}s`;
        
        const icon = tacticIcons[tactic.type] || '⚡';
        const severity = tactic.severity || 'Medium';
        
        item.innerHTML = `
            <div class="manipulation-item-header">
                <div class="manipulation-icon">${icon}</div>
                <div class="manipulation-title-group">
                    <div class="manipulation-title">${tactic.name}</div>
                    <div class="manipulation-severity" style="color: ${severityColors[severity]}">${severity} Severity</div>
                </div>
            </div>
            <div class="manipulation-description">${tactic.description}</div>
            ${tactic.example ? `
                <div class="manipulation-examples">
                    <div class="manipulation-examples-title">Example</div>
                    <div class="manipulation-examples-text">"${tactic.example}"</div>
                </div>
            ` : ''}
        `;
        
        manipulationList.appendChild(item);
    });
}

// ========== LOADING STATES ==========

function showLoadingState(element) {
    if (!element) return;
    element.classList.add('skeleton');
    element.style.pointerEvents = 'none';
}

function hideLoadingState(element) {
    if (!element) return;
    element.classList.remove('skeleton');
    element.style.pointerEvents = 'auto';
}

function createLoadingSpinner() {
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    return spinner;
}

// ========== ENHANCED INITIALIZATION ==========

// Initialize enhanced UI elements
enhanceUIElements();

function enhanceUIElements() {
    // Add smooth scroll behavior
    document.documentElement.style.scrollBehavior = 'smooth';
    
    // Add focus-visible class for better keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            document.body.classList.add('keyboard-nav');
        }
    });
    
    document.addEventListener('mousedown', () => {
        document.body.classList.remove('keyboard-nav');
    });
    
    // Enhance button interactions
    document.querySelectorAll('button, .option-card, .scenario-card').forEach(element => {
        element.addEventListener('mousedown', function(e) {
            this.style.transform = 'scale(0.98)';
        });
        
        element.addEventListener('mouseup', function(e) {
            this.style.transform = '';
        });
    });
}

// ========== ENHANCED ANALYZER DISPLAY ==========

const originalAnalyzeText = window.analyzeText || (typeof analyzeText !== 'undefined' ? analyzeText : null);

if (originalAnalyzeText) {
    window.analyzeText = async function(text) {
        const analyzeBtn = document.getElementById('analyze-btn');
        
        // Show loading state
        if (analyzeBtn) {
            const originalText = analyzeBtn.textContent;
            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = '<div class="loading-spinner"></div> Analyzing...';
        }
        
        try {
            await originalAnalyzeText(text);
        } finally {
            // Hide loading state
            if (analyzeBtn) {
                analyzeBtn.disabled = false;
                analyzeBtn.textContent = 'Analyze';
            }
        }
    };
}

// ========== SCROLL REVEAL ANIMATIONS ==========

function initScrollReveal() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-slide-up');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    document.querySelectorAll('.option-card, .scenario-card, .manipulation-item').forEach(el => {
        observer.observe(el);
    });
}

// Initialize scroll reveal when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollReveal);
} else {
    initScrollReveal();
}

// ========== TOAST NOTIFICATIONS ==========

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: var(--bg-elevated);
        color: var(--text-primary);
        padding: 1rem 1.5rem;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        animation: slideInUp 0.3s ease;
        border-left: 4px solid var(--accent);
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========== ENHANCED UI FEATURES ==========

function initFeedbackForm() {
    const starButtons = document.querySelectorAll(".feedback-star");
    const feedbackSubmitBtn = document.getElementById("feedback-submit");
    const feedbackTextarea = document.getElementById("feedback-message");
    const feedbackRatingValue = document.getElementById("feedback-rating-value");

    if (!starButtons.length || !feedbackSubmitBtn) {
        return;
    }

    const updateFeedbackStars = (rating, { updateDisplay = true } = {}) => {
        starButtons.forEach((btn) => {
            const value = Number(btn.dataset.value);
            const isActive = rating > 0 && value <= rating;
            btn.classList.toggle("active", isActive);
            btn.setAttribute("aria-pressed", isActive ? "true" : "false");
        });

        if (updateDisplay && feedbackRatingValue) {
            feedbackRatingValue.textContent = rating ? `${rating} / 5` : "No rating yet";
        }
    };

    starButtons.forEach((btn) => {
        const value = Number(btn.dataset.value);

        btn.addEventListener("mouseenter", () => updateFeedbackStars(value, { updateDisplay: false }));
        btn.addEventListener("focus", () => updateFeedbackStars(value, { updateDisplay: false }));
        btn.addEventListener("mouseleave", () => updateFeedbackStars(feedbackRating, { updateDisplay: false }));
        btn.addEventListener("blur", () => updateFeedbackStars(feedbackRating, { updateDisplay: false }));
        btn.addEventListener("click", () => {
            feedbackRating = value;
            updateFeedbackStars(feedbackRating);
        });
        btn.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                btn.click();
            }
        });
    });

    updateFeedbackStars(feedbackRating);

    const feedbackSubmitDefaultText = feedbackSubmitBtn.textContent || "Send Feedback";

    feedbackSubmitBtn.addEventListener("click", async () => {
        if (feedbackSubmitBtn.disabled) {
            return;
        }

        if (!feedbackRating) {
            showToast("Select a star rating to send feedback.");
            return;
        }

        const message = (feedbackTextarea?.value || "").trim();
        const resolvedName = (() => {
            const candidate = (appState.userName || localStorage.getItem("userName") || "").trim();
            return candidate || "Anonymous";
        })();

        feedbackSubmitBtn.disabled = true;
        feedbackSubmitBtn.textContent = "Sending...";
        feedbackSubmitBtn.setAttribute("aria-busy", "true");

        try {
            await sendFeedbackToBackend({
                name: resolvedName,
                stars: feedbackRating,
                message,
            });

            showToast("Feedback sent! Thank you for sharing.", "success");

            if (feedbackTextarea) {
                feedbackTextarea.value = "";
            }

            feedbackRating = 5;
            updateFeedbackStars(feedbackRating);
        } catch (error) {
            logBackendError("feedback", error);
            showToast("Unable to send feedback. Please try again.", "error");
        } finally {
            feedbackSubmitBtn.disabled = false;
            feedbackSubmitBtn.textContent = feedbackSubmitDefaultText;
            feedbackSubmitBtn.removeAttribute("aria-busy");
        }
    });
}

// Emoji Picker Functionality - OLD IMPLEMENTATION REMOVED (using new emotion-based picker below)
// Quick Actions Menu code removed - handled elsewhere if needed

// Create enhanced input actions if they don't exist
function enhanceChatInput() {
    const chatInputBar = document.querySelector('.chat-input-bar');
    if (!chatInputBar || chatInputBar.querySelector('.chat-input-actions')) return;
    
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'chat-input-actions';
    actionsDiv.innerHTML = `
        <button class="input-action-btn" id="emoji-btn" title="Add emoji">😊</button>
        <button class="input-action-btn" id="attachment-btn" title="Quick actions">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="16"></line>
                <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
        </button>
    `;
    
    chatInputBar.insertBefore(actionsDiv, chatInput);
}

// Typing Indicator
function showTypingIndicator() {
    const chatMessages = document.getElementById('chat-messages');
    let typingIndicator = document.getElementById('typing-indicator');
    
    if (!typingIndicator) {
        typingIndicator = document.createElement('div');
        typingIndicator.id = 'typing-indicator';
        typingIndicator.className = 'typing-indicator';
        typingIndicator.innerHTML = `
            <div class="typing-bubble" role="status" aria-live="polite" aria-label="Friend is typing">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;
    } else {
        chatMessages.removeChild(typingIndicator);
    }
    
    chatMessages.appendChild(typingIndicator);
    typingIndicator.style.display = 'flex';
    syncChatScrollState({ container: chatMessages });
    
    return typingIndicator;
}

function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

// Add Message Reactions
function addMessageReactions(messageElement) {
    if (messageElement.querySelector('.message-reactions')) return;
    
    const reactions = document.createElement('div');
    reactions.className = 'message-reactions';
    reactions.innerHTML = `
        <button class="reaction-btn" data-reaction="❤️">❤️</button>
        <button class="reaction-btn" data-reaction="😂">😂</button>
        <button class="reaction-btn" data-reaction="😭">😭</button>
        <button class="reaction-btn" data-reaction="😡">😡</button>
    `;
    
    reactions.addEventListener('click', function(e) {
        if (e.target.classList.contains('reaction-btn')) {
            e.target.style.transform = 'scale(1.5)';
            setTimeout(() => e.target.style.transform = 'scale(1)', 200);
        }
    });
    
    messageElement.appendChild(reactions);
}

// Add Message Options Menu
function addMessageOptions(messageElement) {
    if (messageElement.querySelector('.message-options')) return;
    
    const options = document.createElement('div');
    options.className = 'message-options';
    options.innerHTML = `
        <button class="message-options-btn">⋯</button>
        <div class="message-options-menu">
            <button class="message-option-item" data-action="copy">
                <span class="message-option-icon">📋</span>
                <span>Copy</span>
            </button>
            <button class="message-option-item" data-action="delete">
                <span class="message-option-icon">🗑️</span>
                <span>Delete</span>
            </button>
            <button class="message-option-item" data-action="favorite">
                <span class="message-option-icon">⭐</span>
                <span>Favorite</span>
            </button>
            <button class="message-option-item" data-action="regenerate">
                <span class="message-option-icon">🔄</span>
                <span>Regenerate</span>
            </button>
        </div>
    `;
    
    const btn = options.querySelector('.message-options-btn');
    const menu = options.querySelector('.message-options-menu');
    
    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        menu.classList.toggle('show');
    });
    
    menu.addEventListener('click', function(e) {
        const item = e.target.closest('.message-option-item');
        if (item) {
            const action = item.dataset.action;
            const messageText = messageElement.querySelector('.message-content')?.textContent;
            
            if (action === 'copy' && messageText) {
                navigator.clipboard.writeText(messageText);
            } else if (action === 'delete') {
                messageElement.remove();
            } else if (action === 'favorite') {
                messageElement.classList.toggle('favorited');
            }
            
            menu.classList.remove('show');
        }
    });
    
    document.addEventListener('click', function() {
        menu.classList.remove('show');
    });
    
    messageElement.appendChild(options);
}

// Get AI Persona Icon based on toxicity
function getPersonaIcon(toxicity) {
    if (toxicity < 20) return '😊';
    if (toxicity < 40) return '😐';
    if (toxicity < 60) return '😕';
    if (toxicity < 80) return '😠';
    return '😡';
}

// Create Manipulation Detector Dashboard
function createManipulationDetector() {
    const manipulationTypes = [
        {
            icon: '🎭',
            title: 'Guilt-Tripping',
            description: 'Making you feel guilty to get what they want',
            example: '"After everything I\'ve done for you..."',
            detected: false
        },
        {
            icon: '🌫️',
            title: 'Gaslighting',
            description: 'Making you question your own reality',
            example: '"That never happened, you\'re imagining things"',
            detected: false
        },
        {
            icon: '💝',
            title: 'Love Bombing',
            description: 'Excessive affection to manipulate',
            example: '"You\'re the only one who understands me"',
            detected: false
        },
        {
            icon: '🎯',
            title: 'Blame Shifting',
            description: 'Turning everything back on you',
            example: '"This is all your fault"',
            detected: false
        }
    ];
    
    return `
        <div class="manipulation-detector">
            ${manipulationTypes.map(type => `
                <div class="manipulation-card ${type.detected ? 'detected' : ''}">
                    <div class="manipulation-header">
                        <div class="manipulation-icon">${type.icon}</div>
                        <h3 class="manipulation-title">${type.title}</h3>
                        ${type.detected ? '<span class="manipulation-badge">Detected</span>' : ''}
                    </div>
                    <p class="manipulation-description">${type.description}</p>
                    <div class="manipulation-examples">${type.example}</div>
                </div>
            `).join('')}
        </div>
    `;
}

// Create Scene Selector
function createSceneSelector() {
    const scenes = [
        { icon: '😤', title: 'Toxic Friend Fight', desc: 'Heated argument with a close friend' },
        { icon: '💔', title: 'Manipulative Partner', desc: 'Relationship manipulation tactics' },
        { icon: '🌫️', title: 'Gaslighting Scene', desc: 'Reality-questioning conversation' },
        { icon: '😏', title: 'Sarcastic Friend', desc: 'Passive-aggressive banter' },
        { icon: '🤗', title: 'Emotional Support', desc: 'Healthy supportive conversation' },
        { icon: '😄', title: 'Friendly Playful', desc: 'Light-hearted teasing' }
    ];
    
    return `
        <div class="scene-selector-grid">
            ${scenes.map((scene, i) => `
                <div class="scene-card ${i === 0 ? 'active' : ''}" data-scene="${i}">
                    <span class="scene-card-icon">${scene.icon}</span>
                    <h3 class="scene-card-title">${scene.title}</h3>
                    <p class="scene-card-desc">${scene.desc}</p>
                </div>
            `).join('')}
        </div>
    `;
}

// Create Stats Dashboard
function createStatsDashboard() {
    return `
        <div class="stats-dashboard">
            <div class="stat-mini-card">
                <div class="stat-mini-icon">🎚️</div>
                <div class="stat-mini-value" id="stat-toxicity">50</div>
                <div class="stat-mini-label">Toxicity Level</div>
                <div class="toxicity-meter">
                    <div class="toxicity-meter-fill" style="width: 50%"></div>
                </div>
            </div>
            
            <div class="stat-mini-card">
                <div class="intensity-gauge" style="--intensity: 50">
                    <div class="intensity-value">50%</div>
                </div>
                <div class="stat-mini-label">Scene Intensity</div>
            </div>
            
            <div class="stat-mini-card">
                <div class="stat-mini-icon">💬</div>
                <div class="stat-mini-value" id="stat-messages">0</div>
                <div class="stat-mini-label">Messages Analyzed</div>
                <div class="stat-mini-change positive">↑ 0 new</div>
            </div>
            
            <div class="stat-mini-card">
                <div class="stat-mini-icon">⚠️</div>
                <div class="stat-mini-value" id="stat-tactics">0</div>
                <div class="stat-mini-label">Tactics Detected</div>
            </div>
        </div>
    `;
}

// Initialize enhanced chat features
function initEnhancedChat() {
    enhanceChatInput();
    
    // Add enhanced features to existing messages
    const messages = document.querySelectorAll('.chat-message');
    messages.forEach(msg => {
        addMessageReactions(msg);
        addMessageOptions(msg);
    });
}

// Override or enhance existing addMessageToChat function
const originalAddMessage = window.addMessageToChat;
if (typeof originalAddMessage === 'function') {
    window.addMessageToChat = function(...args) {
        const result = originalAddMessage.apply(this, args);
        
        // Get the last message added
        setTimeout(() => {
            const messages = document.querySelectorAll('.chat-message');
            const lastMessage = messages[messages.length - 1];
            if (lastMessage) {
                addMessageReactions(lastMessage);
                addMessageOptions(lastMessage);
            }
        }, 100);
        
        return result;
    };
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEnhancedChat);
} else {
    initEnhancedChat();
}


// ========== CINEMATIC INTRO FOR FIRST 3 DIALOGUES ==========

let cinematicIntroShown = false;

function insertSceneIntro(title) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    const existingIntro = chatMessages.querySelector('.scene-intro');
    if (existingIntro) {
        existingIntro.remove();
    }
    
    const sceneIntro = document.createElement('div');
    sceneIntro.className = 'scene-intro';
    sceneIntro.innerHTML = `
        <div class="scene-header">Scene 1: ${title || 'The Conversation'}</div>
        <div class="scene-divider"></div>
    `;
    
    chatMessages.appendChild(sceneIntro);
    syncChatScrollState({ container: chatMessages });
}

function createCinematicIntro(scenario, friendName) {
    if (cinematicIntroShown) return;
    
    insertSceneIntro(scenario);
    cinematicIntroShown = true;
}


// Inject cinematic intro into existing chat initialization
const originalStartNewChat = window.startNewChat;
if (typeof originalStartNewChat === 'function') {
    window.startNewChat = function() {
        cinematicIntroShown = false;
        cinematicMessageCount = 0;
        const result = originalStartNewChat.apply(this, arguments);
        const scenarioName = appState.scenario ? scenarios[appState.scenario]?.name : null;
        createCinematicIntro(scenarioName, appState.friendName);
        
        return result;
    };
}



// ========== SECURITY FIX: Safe HTML highlighting ==========

// Helper function to safely highlight text without innerHTML
function safelyHighlightText(text, highlightWords) {
    const container = document.createElement('span');
    const words = text.split(/(\s+)/); // Split on whitespace but keep it
    
    words.forEach(word => {
        const cleanWord = word.replace(/[.,!?;:]/g, ''); // Remove punctuation for matching
        const shouldHighlight = highlightWords.some(hw => 
            cleanWord.toLowerCase() === hw.toLowerCase()
        );
        
        if (shouldHighlight && cleanWord.length > 0) {
            const span = document.createElement('span');
            span.className = 'highlight-text';
            span.textContent = word; // Safe: uses textContent
            container.appendChild(span);
        } else {
            const textNode = document.createTextNode(word);
            container.appendChild(textNode);
        }
    });
    
    return container;
}

// Replace the unsafe wrapper with a secure one
(function() {
    let firstCinematicFriendDelayed = false;

    const originalAddMessageToChat = window.addMessageToChat;
    if (typeof originalAddMessageToChat !== 'function') return;
    
    window.addMessageToChat = function(sender, text) {
        const messagesContainer = document.getElementById("chat-messages");
        
        // Check if we should apply cinematic treatment
        if (typeof cinematicMessageCount !== 'undefined' && cinematicMessageCount < 3) {
            const messageDiv = document.createElement("div");
            messageDiv.className = `message ${sender} cinematic-message`;
            if (sender === 'friend') {
                messageDiv.classList.add('cinematic-friend');
                if (!firstCinematicFriendDelayed) {
                    messageDiv.classList.add('cinematic-friend-delay');
                    firstCinematicFriendDelayed = true;
                }
            } else {
                messageDiv.classList.add('cinematic-user');
            }
            
            const bubbleDiv = document.createElement("div");
            bubbleDiv.className = "message-bubble";
            
            if (sender === 'friend') {
                // SAFE: Use DOM methods instead of innerHTML
                const highlightWords = ['sorry', 'you', 'me', 'never', 'always', 'why', 'how', 'what', 'I', 'your', 'my'];
                const highlightedContent = safelyHighlightText(text, highlightWords);
                bubbleDiv.appendChild(highlightedContent);
            } else {
                // Keep user messages plain to avoid low-contrast highlights
                bubbleDiv.textContent = text;
            }
            
            const timeDiv = document.createElement("div");
            timeDiv.className = "message-time";
            timeDiv.textContent = "Just now"; // Safe: uses textContent
            
            messageDiv.appendChild(bubbleDiv);
            messageDiv.appendChild(timeDiv);
            messagesContainer.appendChild(messageDiv);
            
            cinematicMessageCount++;
            
            // Add scene divider after 3rd message
            if (cinematicMessageCount === 3) {
        // Removed extra divider after cinematic intro
            }
            
            syncChatScrollState({ container: messagesContainer });
            
            // Add enhanced features
            setTimeout(() => {
                if (typeof addMessageReactions === 'function') {
                    addMessageReactions(messageDiv);
                }
                if (typeof addMessageOptions === 'function') {
                    addMessageOptions(messageDiv);
                }
            }, 100);
        } else {
            // Use original function for messages after the first 3
            originalAddMessageToChat.call(this, sender, text);
            
            // Still add enhanced features
            setTimeout(() => {
                const messages = messagesContainer.querySelectorAll('.message');
                const lastMessage = messages[messages.length - 1];
                if (lastMessage) {
                    if (typeof addMessageReactions === 'function') {
                        addMessageReactions(lastMessage);
                    }
                    if (typeof addMessageOptions === 'function') {
                        addMessageOptions(lastMessage);
                    }
                }
            }, 100);
        }
    };
})();


// ========== PREMIUM FEATURES - EMOJI, VOICE, TOXICITY ADJUSTER ==========

// Emoji Picker Functionality with Emotion Categories
function initEmojiPicker() {
    const emojiBtn = document.getElementById('emoji-btn');
    const emojiPicker = document.getElementById('emoji-picker');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const voiceBtn = document.getElementById('voice-btn');

    // Check if already initialized to avoid duplicate event listeners
    if (emojiBtn && emojiBtn.dataset.initialized === 'true') {
        return;
    }

    // Emotion categories with their emoji arrays
    const emotionEmojis = {
        happy: ['😊', '😄', '😃', '🙂', '😁', '😆', '😋', '😍', '🥰', '😘', '🤗', '😇'],
        sad: ['😢', '😭', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😰'],
        angry: ['😠', '😡', '🤬', '😤', '😾', '💢', '🔥', '⚡'],
        love: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '❣️'],
        excited: ['🎉', '🎊', '🥳', '🎈', '🎁', '✨', '🌟', '💫', '⭐', '🔥', '💯', '🚀'],
        confuse: ['🤔', '😕', '😐', '😑', '🙄', '😶', '🤷', '🤷‍♂️', '🤷‍♀️'],
        laugh: ['😂', '🤣', '😹', '😆', '😅', '🤪', '😜', '😝', '🤭'],
        cool: ['😎', '🤠', '😏', '😌', '😉', '😗', '😙', '😚', '🧐']
    };

    if (emojiBtn && emojiPicker) {
        emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            emojiPicker.classList.toggle('active');
        });

        // Close emoji picker when clicking outside
        document.addEventListener('click', (e) => {
            if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
                emojiPicker.classList.remove('active');
            }
        });

        // Handle emotion category clicks - add random emoji from that category
        const categoryButtons = emojiPicker.querySelectorAll('.emoji-category-btn');
        categoryButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const category = btn.dataset.category;
                const emojis = emotionEmojis[category];
                if (emojis && emojis.length > 0) {
                    // Pick a random emoji from the category
                    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                    if (chatInput) {
                        chatInput.value += randomEmoji;
                        chatInput.focus();
                        updateSendVoiceButton();
                    }
                    emojiPicker.classList.remove('active');
                }
            });
        });
        
        // Mark as initialized
        emojiBtn.dataset.initialized = 'true';
    }
}

// Initialize emoji picker when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmojiPicker);
} else {
    initEmojiPicker();
}

// Dynamic Send/Voice Button Switching
function updateSendVoiceButton() {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const voiceBtn = document.getElementById('voice-btn');
    
    if (!chatInput || !sendBtn || !voiceBtn) return;
    
    const hasText = chatInput.value.trim().length > 0;
    
    if (hasText) {
        sendBtn.style.display = 'flex';
        voiceBtn.style.display = 'none';
    } else {
        sendBtn.style.display = 'none';
        voiceBtn.style.display = 'flex';
    }
}

// Initialize send/voice button switching when chat step is shown
function initSendVoiceButton() {
    const chatInput = document.getElementById('chat-input');
    if (!chatInput) return;
    
    // Check if already initialized
    if (chatInput.dataset.sendVoiceInitialized === 'true') return;
    
    chatInput.addEventListener('input', updateSendVoiceButton);
    chatInput.addEventListener('change', updateSendVoiceButton);
    // Initial check
    updateSendVoiceButton();
    
    // Mark as initialized
    chatInput.dataset.sendVoiceInitialized = 'true';
}

// Initialize chat input handlers (Enter key, send button, etc.)
function initChatInputHandlers() {
    const chatInput = document.getElementById("chat-input");
    const sendBtn = document.getElementById("send-btn");
    
    if (!chatInput || !sendBtn) return;
    
    // Check if already initialized
    if (chatInput.dataset.handlersInitialized === 'true') return;
    
    // Enter key handler
    chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            // Check if send button is disabled (waiting for AI response)
            const sendBtn = document.getElementById("send-btn");
            if (sendBtn && !sendBtn.disabled) {
                sendMessage();
            }
        }
    });

    // Send button click handler
    sendBtn.addEventListener("click", () => {
        // Check if button is disabled before sending
        if (!sendBtn.disabled) {
            sendMessage();
        }
    });
    
    // Mark as initialized
    chatInput.dataset.handlersInitialized = 'true';
    
    // Update send/voice button visibility
    initSendVoiceButton();
}

// Voice Input Functionality (Web Speech API)
const chatInput = document.getElementById('chat-input');
const voiceBtn = document.getElementById('voice-btn');
let recognition = null;
let isRecording = false;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (chatInput) {
            chatInput.value = transcript;
            updateSendVoiceButton();
            chatInput.focus();
        }
        isRecording = false;
        if (voiceBtn) {
            voiceBtn.classList.remove('recording');
        }
    };

    recognition.onerror = () => {
        isRecording = false;
        if (voiceBtn) {
            voiceBtn.classList.remove('recording');
        }
    };

    recognition.onend = () => {
        isRecording = false;
        if (voiceBtn) {
            voiceBtn.classList.remove('recording');
        }
    };
}

async function ensureMicrophonePermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const message = 'Voice input needs a supported browser (Chrome/Edge) over HTTPS.';
        console.error(message);
        if (typeof showToast === 'function') {
            showToast(message, 'error');
        } else {
            alert(message);
        }
        return false;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (error) {
        console.error('Microphone permission denied:', error);
        if (typeof showToast === 'function') {
            showToast('Please allow microphone access to use voice input.', 'error');
        }
        return false;
    }
}

function attachVoiceButtonHandler() {
    if (!voiceBtn) {
        return;
    }

    const handleVoiceInteraction = async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const hasPermission = await ensureMicrophonePermission();
        if (!hasPermission) {
            return;
        }

        if (!recognition) {
            alert('Voice input is not supported in your browser. Please type your message instead.');
            return;
        }

        if (isRecording) {
            recognition.stop();
            isRecording = false;
            voiceBtn.classList.remove('recording');
            return;
        }

        try {
            recognition.start();
            isRecording = true;
            voiceBtn.classList.add('recording');
        } catch (error) {
            console.error('Unable to start voice recognition:', error);
            isRecording = false;
            voiceBtn.classList.remove('recording');
            if (typeof showToast === 'function') {
                showToast('Unable to access microphone. Please try again.', 'error');
            }
        }
    };

    voiceBtn.addEventListener('click', handleVoiceInteraction);
    voiceBtn.addEventListener('touchend', handleVoiceInteraction, { passive: false });
}

attachVoiceButtonHandler();

// Toxicity Adjuster Modal
function initToxicityAdjuster() {
    const toxicityAdjustBtn = document.getElementById('toxicity-adjust-btn');
    const toxicityModal = document.getElementById('toxicity-modal');
    const toxicityModalClose = document.getElementById('toxicity-modal-close');
    const modalToxicitySlider = document.getElementById('modal-toxicity-slider');
    const applyToxicityBtn = document.getElementById('apply-toxicity-btn');

    if (!toxicityModal) return;

    // Check if already initialized to avoid duplicate event listeners
    if (toxicityAdjustBtn && toxicityAdjustBtn.dataset.initialized === 'true') {
        return;
    }

    if (toxicityAdjustBtn) {
        toxicityAdjustBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (modalToxicitySlider) {
                // Get current toxicity - prioritize saved chat's toxicity if viewing from history
                let currentToxicity = 50; // default fallback
                
                if (appState.currentChatId && appState.isFromHistory) {
                    // Get from chat history for saved chats
                    const chats = JSON.parse(localStorage.getItem('chatHistory') || '[]');
                    const currentChat = chats.find(c => c.id === appState.currentChatId);
                    if (currentChat && currentChat.toxicity !== undefined) {
                        currentToxicity = currentChat.toxicity;
                    } else if (appState.toxicity !== undefined) {
                        currentToxicity = appState.toxicity;
                    }
                } else {
                    // For new chats, use the current app state toxicity (allow 0)
                    currentToxicity =
                        typeof appState.toxicity === 'number' && !Number.isNaN(appState.toxicity)
                            ? appState.toxicity
                            : 50;
                }
                
                modalToxicitySlider.value = currentToxicity;
                updateModalToxicityDisplay(currentToxicity);
            }
            toxicityModal.classList.add('active');
        });
        toxicityAdjustBtn.dataset.initialized = 'true';
    }

    if (toxicityModalClose) {
        toxicityModalClose.addEventListener('click', () => {
            toxicityModal.classList.remove('active');
        });
    }

    toxicityModal.addEventListener('click', (e) => {
        if (e.target === toxicityModal) {
            toxicityModal.classList.remove('active');
        }
    });

    if (modalToxicitySlider) {
        modalToxicitySlider.addEventListener('input', (e) => {
            updateModalToxicityDisplay(e.target.value);
        });
    }

    if (applyToxicityBtn && modalToxicitySlider) {
        applyToxicityBtn.addEventListener('click', () => {
            const newToxicity = parseInt(modalToxicitySlider.value);
            appState.toxicity = newToxicity;
            
            // Update in chat history if this is from history
            if (appState.currentChatId) {
                const chats = JSON.parse(localStorage.getItem('chatHistory') || '[]');
                const chatIndex = chats.findIndex(c => c.id === appState.currentChatId);
                if (chatIndex !== -1) {
                    chats[chatIndex].toxicity = newToxicity;
                    localStorage.setItem('chatHistory', JSON.stringify(chats));
                }
            }
            
            // Update toxicity badge in dropdown if it exists
            const toxicityBadge = document.getElementById('dropdown-toxicity-badge');
            if (toxicityBadge) {
                toxicityBadge.textContent = newToxicity;
            }

            const mainToxicitySlider = document.getElementById('toxicity-slider');
            if (mainToxicitySlider) {
                mainToxicitySlider.value = newToxicity;
            }
            updateToxicityDisplay(newToxicity);
            if (typeof loadChatHistory === 'function') {
                loadChatHistory();
            }
            
            toxicityModal.classList.remove('active');
            
            // Show confirmation message
            showToxicityUpdateMessage(newToxicity);
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToxicityAdjuster);
} else {
    initToxicityAdjuster();
}

function updateModalToxicityDisplay(value) {
    const toxicity = parseInt(value);
    const modalToxicityValue = document.getElementById('modal-toxicity-value');
    const modalToxicityLabel = document.getElementById('modal-toxicity-label');
    const modalToxicityEmoji = document.getElementById('modal-toxicity-emoji');
    if (!modalToxicityValue || !modalToxicityLabel || !modalToxicityEmoji) return;

    modalToxicityValue.textContent = toxicity;

    let label = "";
    let emoji = "😐";

    if (toxicity >= 90) {
        label = "Extremely Toxic";
        emoji = "🤬";
    } else if (toxicity >= 80) {
        label = "Very Aggressive";
        emoji = "😡";
    } else if (toxicity >= 70) {
        label = "Highly Frustrated";
        emoji = "😤";
    } else if (toxicity >= 60) {
        label = "Really Frustrated";
        emoji = "😠";
    } else if (toxicity >= 50) {
        label = "Moderately Upset";
        emoji = "😒";
    } else if (toxicity >= 40) {
        label = "Slightly Annoyed";
        emoji = "😑";
    } else if (toxicity >= 30) {
        label = "A Bit Cold";
        emoji = "😐";
    } else if (toxicity >= 20) {
        label = "Mostly Calm";
        emoji = "🙂";
    } else if (toxicity >= 10) {
        label = "Quite Understanding";
        emoji = "😊";
    } else {
        label = "Very Calm";
        emoji = "😌";
    }

    modalToxicityLabel.textContent = label;
    modalToxicityEmoji.textContent = emoji;
}

function showToxicityUpdateMessage(toxicity) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-intro';
    messageDiv.style.padding = '1rem';
    messageDiv.style.marginBottom = '1rem';
    messageDiv.innerHTML = `
        <div style="background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.1) 0%, rgba(var(--accent-rgb), 0.05) 100%); 
                    border: 1px solid rgba(var(--accent-rgb), 0.2); 
                    border-radius: 12px; 
                    padding: 1rem; 
                    font-size: 0.875rem; 
                    color: var(--text-secondary);">
            ⚙️ Toxicity level updated to ${toxicity}. The conversation intensity has been adjusted.
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    syncChatScrollState({ container: messagesContainer });
    
    // Remove after 3 seconds
    setTimeout(() => {
        messageDiv.style.opacity = '0';
        messageDiv.style.transition = 'opacity 0.3s ease';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}

// Dynamic Toxicity Backgrounds
function updateToxicityBackground(toxicity) {
    const toxicityStep = document.getElementById('toxicity-step');
    if (!toxicityStep) return;
    
    // Remove existing background classes
    toxicityStep.classList.remove('toxicity-bg-calm', 'toxicity-bg-medium', 'toxicity-bg-intense');
    
    // Remove existing background element
    const existingBg = toxicityStep.querySelector('.toxicity-step-bg');
    if (existingBg) {
        existingBg.remove();
    }
    
    // Add new background
    const bgDiv = document.createElement('div');
    bgDiv.className = 'toxicity-step-bg';
    
    if (toxicity < 34) {
        bgDiv.classList.add('toxicity-bg-calm');
    } else if (toxicity < 67) {
        bgDiv.classList.add('toxicity-bg-medium');
    } else {
        bgDiv.classList.add('toxicity-bg-intense');
    }
    
    toxicityStep.prepend(bgDiv);
}

// Hook into existing toxicity slider if it exists
const toxicitySliderMain = document.getElementById('toxicity-slider');
if (toxicitySliderMain) {
    const originalListener = toxicitySliderMain.oninput;
    toxicitySliderMain.addEventListener('input', (e) => {
        updateToxicityBackground(e.target.value);
    });
    // Initialize on load
    setTimeout(() => {
        if (toxicitySliderMain.value) {
            updateToxicityBackground(toxicitySliderMain.value);
        }
    }, 100);
}

// Improved Welcome Dialogues
const welcomeSlides = [
    {
        emoji: "😔",
        title: "Tired of Toxic Conversations?",
        subtitle: "when friendships feel more draining than fulfilling",
        description: "Practice handling difficult conversations in a safe space. Learn to recognize manipulation and build healthier communication patterns."
    },
    {
        emoji: "🎯",
        title: "Master Difficult Conversations",
        subtitle: "build confidence in challenging interactions",
        description: "Train yourself to spot red flags, set boundaries, and respond effectively when someone tries to manipulate or guilt-trip you."
    },
    {
        emoji: "💪",
        title: "Practice Makes Perfect",
        subtitle: "safe AI-powered conversation training",
        description: "Experience realistic scenarios, adjust toxicity levels, and learn at your own pace. Build the skills you need for real-life situations."
    }
];

// Update welcome slides if they exist
function improveWelcomeDialogues() {
    welcomeSlides.forEach((slide, index) => {
        const slideNum = index + 1;
        const slideElement = document.getElementById(`slide-${slideNum}`);
        if (slideElement) {
            const emojiEl = slideElement.querySelector('.welcome-emoji');
            const titleEl = slideElement.querySelector('.welcome-title');
            const subtitleEl = slideElement.querySelector('.welcome-subtitle');
            const descEl = slideElement.querySelector('.welcome-description');
            
            if (emojiEl) emojiEl.textContent = slide.emoji;
            if (titleEl) titleEl.textContent = slide.title;
            if (subtitleEl) subtitleEl.textContent = slide.subtitle;
            if (descEl) descEl.textContent = slide.description;
        }
    });
}

// Initialize improvements when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        improveWelcomeDialogues();
        updateSendVoiceButton();
    });
} else {
    improveWelcomeDialogues();
    updateSendVoiceButton();
}

// Fix Message Timing and Positioning
function fixMessageTiming() {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    // Ensure instant scrolling so first messages appear immediately
    messagesContainer.style.scrollBehavior = 'auto';
    
    // Fix input bar positioning
    const inputBar = document.querySelector('.chat-input-bar');
    if (inputBar) {
        inputBar.style.position = 'sticky';
        inputBar.style.bottom = '0';
        inputBar.style.zIndex = '100';
    }
    
    syncChatScrollState({ container: messagesContainer });
}

// Call on page load
setTimeout(fixMessageTiming, 100);

