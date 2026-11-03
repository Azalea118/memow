// This form uses the existing same-origin browser-session endpoint.
(()=>{
 const form=document.querySelector('#signin-form'),password=document.querySelector('#signin-password'),toggle=document.querySelector('#password-toggle'),submit=document.querySelector('#signin-submit'),error=document.querySelector('#signin-error');
 const params=new URLSearchParams(location.search),requested=params.get('next')||'/';
 const next=requested.startsWith('/')&&!requested.startsWith('//')&&!/[\\\x00-\x1f\x7f]/.test(requested)?requested:'/';
 document.querySelector('#signin-next').value=next;
 const action=new URL('/auth/login',location.href);action.searchParams.set('next',next);form.action=action.href;
 const messages={credentials:'The username or password is incorrect. Please try again.',rate_limited:'Too many sign-in attempts. Please wait a minute and try again.',session:'Your session has ended. Please sign in again.'};
 if(messages[params.get('error')]){error.textContent=messages[params.get('error')];error.hidden=false;error.focus();}
 toggle.addEventListener('click',()=>{const visible=password.type==='password';password.type=visible?'text':'password';toggle.setAttribute('aria-pressed',String(visible));toggle.setAttribute('aria-label',visible?'Hide password':'Show password');toggle.querySelector('.eye-slash').toggleAttribute('hidden',!visible);});
 password.addEventListener('keyup',event=>{document.querySelector('#caps-warning').hidden=!event.getModifierState('CapsLock');});
 password.addEventListener('blur',()=>{document.querySelector('#caps-warning').hidden=true;});
 let submitting=false;
 form.addEventListener('submit',event=>{if(submitting){event.preventDefault();return;}submitting=true;submit.disabled=true;submit.querySelector('span').textContent='Signing in…';form.setAttribute('aria-busy','true');});
 window.addEventListener('pageshow',()=>{submitting=false;submit.disabled=false;submit.querySelector('span').textContent='Sign in';form.removeAttribute('aria-busy');});
})();
