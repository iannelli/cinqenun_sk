<script>
    import { resolve } from '$app/paths';
    import { page } from '$app/stores';
    import { beforeNavigate, afterNavigate } from '$app/navigation';

    beforeNavigate(() => { document.body.classList.add('wait-cursor'); });
    afterNavigate(() =>  { document.body.classList.remove('wait-cursor'); });
</script>

<div class="sidebar close">
    <ul class="nav-links">
        <li class="li0">
            <a href={null}><i><img src="/setting.png" alt="" width="20px" height="20px"></i></a>
            <ul class="sub-menu blank"><li><a class="link_name" href={null} style="font-size:14px">Cinqenun - Version 1.0 du 28/08/2023</a></li></ul>
        </li>
        <li class="ian" class:active={$page.url.pathname === '/dashboard'}>
            <a href={null}><i><img src="/dashboard.png" alt="" width="20px" height="20px"></i></a>
            <ul class="sub-menu blank">
                <li><a class="link_name" href={resolve('/dashboard')}>Dashboard</a></li>
            </ul>
        </li>
        <li class="ian" class:active={$page.url.pathname.startsWith('/abonne')}>
            <div class="iocn-link"><a href={null}><i><img src="/monCompte.png" alt="" width="20px" height="20px"></i></a></div>
            <ul class="sub-menu">
                <li><a class="link_name" href={null}>Mon Compte</a></li>
                <li><a href={resolve('/abonne/identification')}>Identification</a></li>
                <li><a href={resolve('/abonne/fiscalite')}>Fiscalité</a></li>
                <li><a href={resolve('/abonne/abonnement')}>Abonnement</a></li>
            </ul>
        </li>
        <li class="ian" class:active={$page.url.pathname === '/affaire'}>
            <a href={null}><i><img src="/affaire.png" alt="" width="20px" height="20px"></i></a>
            <ul class="sub-menu blank"><li><a class="link_name" href={resolve('/affaire')}>Affaires</a></li></ul>
        </li>
        <li class="ian" class:active={$page.url.pathname === '/client'}>
            <a href={null}><i><img src="/client.png" alt="" width="20px" height="20px"></i></a>
            <ul class="sub-menu blank"><li><a class="link_name" href={resolve('/client')}>Clients</a></li></ul>
        </li>
        <li class="ian" class:active={$page.url.pathname.startsWith('/compta')}>
            <div class="iocn-link"><a href={null}><i><img src="/compta.png" alt="" width="20px" height="20px"></i></a></div>
            <ul class="sub-menu">
                <li><a class="link_name" href={null}>Comptabilité</a></li>
                <li><a href={null}>Recette</a></li>
                <li><a href={null}>Dépense</a></li>
                <li><a href={null}>Immobilisation</a></li>
            </ul>
        </li>
        <li class="ian" class:active={$page.url.pathname.startsWith('/declaration')}>
            <div class="iocn-link"><a href={null}><i><img src="/decla.png" alt="" width="20px" height="20px"></i></a></div>
            <ul class="sub-menu">
                <li><a class="link_name" href={null}>Déclaration</a></li>
                <li><a href={null}>TVA</a></li>
                <li><a href={null}>Résultat</a></li>
            </ul>
        </li>
        <li class="ian">
            <a href={null}><i><img src="/exit.png" alt="" width="20px" height="20px"></i></a>
            <ul class="sub-menu blank">
                <li>
                    <form method="POST" action="/logout" style="display:contents">
                        <button type="submit" class="link_name logout-btn">Déconnexion</button>
                    </form>
                </li>
            </ul>
        </li>
    </ul>
</div>

<style>
    .sidebar {
        position: fixed;
        top: 0;
        left: 0;
        height: 100vh; /* For 100% screen height */
        width: 278px;
        background: #11101d; /* --- couleur du Menu ----*/
        z-index: 100;
        transition: all 0.5s ease;
    }
    .close {
        width: 58px;
    }
    .sidebar .nav-links {
        height: 100%;
        padding: 30px 0 50px 0;
        overflow: auto;
    }
    .sidebar.close .nav-links {
        overflow: visible;
    }
    .sidebar .nav-links li {
        position: relative;
        list-style: none;
        transition: all 0.4s ease;
    }
    .sidebar .nav-links > li.active:before, .sidebar .nav-links > li:before {
        position:absolute;
        left: 0;
        top: 0;
        content: '';
        width: 4px;
        height: 100%;
        background: #fff; /* --- SélecteurGauche de Positionnement Rubrique menu ---- */
        opacity: 0;
        transition: all 0.25s ease-in-out;
        border-top-right-radius: 5px;
        border-top-right-radius: 5px;
    }
    .sidebar .nav-links li.active:before, .sidebar .nav-links li:hover:before {
        opacity: 1;
    }
    .sidebar .nav-links .li0 {
        margin-top: -20px;
        margin-bottom: 30px;
    }
    .sidebar .nav-links .li0:hover:before {
        opacity: 0;
    }
    .ian {
        font-size: 20px;
    }
    .sidebar .nav-links li i {
        height: 50px;
        min-width: 58px;
        text-align: center;
        line-height: 50px;
        color: #fff;
        font-size: 20px;
        cursor: pointer;
        transition: all 0.3s ease;
    }
    .sidebar .nav-links li a {
        display: flex;
        align-items: center;
        text-decoration: none;
    }
    .sidebar .nav-links li .sub-menu {
        padding: 6px 6px 14px 80px;
        margin-top: -10px;
        background: #1d1b31; /* couleur du sous-menu */
        display: none;
    }
    .sidebar .nav-links li .sub-menu a {
        color: #fff;
        font-size: 17px;
        padding: 5px 0;
        white-space: nowrap;
        opacity: 0.6;
        transition: all 0.8s ease;
    }
    .sidebar .nav-links li .sub-menu a:hover {
        opacity: 1;
        cursor:pointer;
    }
    .sidebar.close .nav-links li .sub-menu {
        position: absolute;
        left: 100%;
        top: -10px;
        margin-top: 0;
        padding: 10px 20px;
        border-radius: 0 6px 6px 0;
        opacity: 0;
        display: block;
        pointer-events: none;
        transition: 0.8s;
    }
    .sidebar.close .nav-links li:hover .sub-menu {
        top: 0;
        opacity: 1;
        pointer-events: auto;
        transition: all 0.3s ease;
        cursor: pointer;
        z-index: 200;
    }
    .sidebar.close .nav-links li:hover .sub-menu a {
        pointer-events: auto;
    }
    .sidebar.close .nav-links li .sub-menu .link_name {
        font-size: 18px;
        opacity: 1;
        display: block;
        cursor:pointer;
        pointer-events: auto;
    }
    .sidebar .nav-links li .sub-menu.blank {
        padding: 3px 20px 6px 16px;
        opacity: 0;
        pointer-events: none;
        cursor: pointer;
    }
    .logout-btn {
        background: none;
        border: none;
        color: #fff;
        font-family: inherit;
        font-size: inherit;
        font-style: inherit;
        cursor: pointer;
        padding: 5px 0;
        opacity: 0.6;
        transition: all 0.8s ease;
        pointer-events: auto;
    }
    .logout-btn:hover {
        opacity: 1;
    }
    @media (max-width: 900px) {
        .sidebar {
            width: 60px;
            min-width: 60px;
            padding: 10px 0;
            align-items: center;
        }
        .sidebar a {
            padding: 12px 8px;
            font-size: 0.7rem;
            text-align: center;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
    }
    </style>