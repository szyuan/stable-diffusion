function toBase64(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.readAsDataURL(file);
        r.onload = () => resolve(r.result);
        r.onerror = (error) => reject(error);
    });
}

function appendOutput(src, seed, config) {
    let outputNode = document.createElement("img");
    outputNode.src = src;

    let altText = seed.toString() + " | " + config.prompt;
    outputNode.alt = altText;
    outputNode.title = altText;

    // Reload image config
    outputNode.addEventListener('click', () => {
        let form = document.querySelector("#generate-form");
        for (const [k, v] of new FormData(form)) {
            form.querySelector(`*[name=${k}]`).value = config[k];
        }
        document.querySelector("#seed").value = seed;

        saveFields(document.querySelector("#generate-form"));
    });

    document.querySelector("#results").prepend(outputNode);
}

function saveFields(form) {
    for (const [k, v] of new FormData(form)) {
        if (typeof v !== 'object') { // Don't save 'file' type
            localStorage.setItem(k, v);
        }
    }
}

function loadFields(form) {
    for (const [k, v] of new FormData(form)) {
        const item = localStorage.getItem(k);
        if (item != null) {
            form.querySelector(`*[name=${k}]`).value = item;
        }
    }
}

function clearFields(form) {
    localStorage.clear();
    let prompt = form.prompt.value;
    form.reset();
    form.prompt.value = prompt;
}

const BLANK_IMAGE_URL = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
async function generateSubmit(form) {
    let promptOrigin = document.querySelector("#prompt").value;
    let prompt;

    // NOTE 翻译
    prompt = await translateText(promptOrigin);
    console.log('prompt', prompt);

    // Convert file data to base64
    let formData = Object.fromEntries(new FormData(form));
    formData.prompt = prompt;
    console.log('formData', formData);
    formData.initimg = formData.initimg.name !== '' ? await toBase64(formData.initimg) : null;

    let strength = formData.strength;
    let totalSteps = formData.initimg ? Math.floor(strength * formData.steps) : formData.steps;

    let progressSectionEle = document.querySelector('#progress-section');
    progressSectionEle.style.display = 'initial';
    let progressEle = document.querySelector('#progress-bar');
    progressEle.setAttribute('max', totalSteps);
    let progressImageEle = document.querySelector('#progress-image');
    progressImageEle.src = BLANK_IMAGE_URL;

    progressImageEle.style.display = {}.hasOwnProperty.call(formData, 'progress_images') ? 'initial': 'none';

    // Post as JSON, using Fetch streaming to get results
    fetch(form.action, {
        method: form.method,
        body: JSON.stringify(formData),
    }).then(async (response) => {
        const reader = response.body.getReader();

        let noOutputs = true;
        while (true) {
            let {value, done} = await reader.read();
            value = new TextDecoder().decode(value);
            if (done) {
                progressSectionEle.style.display = 'none';
                break;
            }

            for (let event of value.split('\n').filter(e => e !== '')) {
                const data = JSON.parse(event);

                if (data.event === 'result') {
                    noOutputs = false;
                    document.querySelector("#no-results-message")?.remove();
                    appendOutput(data.url, data.seed, data.config);
                    progressEle.setAttribute('value', 0);
                    progressEle.setAttribute('max', totalSteps);
                } else if (data.event === 'upscaling-started') {
                    document.getElementById("processing_cnt").textContent=data.processed_file_cnt;
                    document.getElementById("scaling-inprocess-message").style.display = "block";
                } else if (data.event === 'upscaling-done') {
                    document.getElementById("scaling-inprocess-message").style.display = "none";
                } else if (data.event === 'step') {
                    progressEle.setAttribute('value', data.step);
                    if (data.url) {
                        progressImageEle.src = data.url;
                    }
                } else if (data.event === 'canceled') {
                    // avoid alerting as if this were an error case
                    noOutputs = false;
                }
            }
        }

        // Re-enable form, remove no-results-message
        form.querySelector('fieldset').removeAttribute('disabled');
        document.querySelector("#prompt").value = promptOrigin;
        document.querySelector('progress').setAttribute('value', '0');

        if (noOutputs) {
            alert("Error occurred while generating.");
        }
    });

    // Disable form while generating
    form.querySelector('fieldset').setAttribute('disabled','');
    document.querySelector("#prompt").value = `生成中: "${promptOrigin}"`;
}

function translateText(text) {
    var appKey = '';
    var key = '';
    var salt = (new Date).getTime();
    var curtime = Math.round(new Date().getTime()/1000);
    var query = text; //'您好，欢迎再次使用有道智云文本翻译API接口服务';
    // 多个query可以用\n连接  如 query='apple\norange\nbanana\npear'
    var from = 'zh-CHS';
    var to = 'en';
    var str1 = appKey + truncate(query) + salt + curtime + key;
    // var vocabId =  '您的用户词表ID';
    //console.log('---',str1);

    var sign = CryptoJS.SHA256(str1).toString(CryptoJS.enc.Hex);


    function truncate(q){
        var len = q.length;
        if(len<=20) return q;
        return q.substring(0, 10) + len + q.substring(len-10, len);
    }


    return new Promise((resolve) => {
        $.ajax({
            url: 'https://openapi.youdao.com/api',
            type: 'post',
            dataType: 'jsonp',
            data: {
                q: query,
                appKey: appKey,
                salt: salt,
                from: from,
                to: to,
                sign: sign,
                signType: "v3",
                curtime: curtime,
                // vocabId: vocabId,
            },
            success: function (data) {
                // console.log(data);
                let result = text;
                if (data.translation && data.translation[0]) {
                    result = data.translation[0];
                }
                result.replace('.', ',');
                resolve(result);
            } 
        });
    })
}

window.onload = () => {
    document.querySelector("#generate-form").addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target;
        generateSubmit(form);
    });
    document.querySelector("#generate-form").addEventListener('change', (e) => {
        saveFields(e.target.form);
    });
    document.querySelector("#reset-seed").addEventListener('click', (e) => {
        document.querySelector("#seed").value = -1;
        saveFields(e.target.form);
    });
    document.querySelector("#reset-all").addEventListener('click', (e) => {
        clearFields(e.target.form);
    });
    loadFields(document.querySelector("#generate-form"));

    document.querySelector('#cancel-button').addEventListener('click', () => {
        fetch('/cancel').catch(e => {
            console.error(e);
        });
    });

    if (!config.gfpgan_model_exists) {
        document.querySelector("#gfpgan").style.display = 'none';
    }
};
