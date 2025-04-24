import shinLogo from '../../images/shin-line-logo.png';

export default function AppLogo() {
    return (
        <div className="text-sidebar-primary-foreground bg-red-600 flex w-100 items-center justify-start p-2 rounded-r-full">
            <img src={shinLogo} alt="Shin-Line Logo" className="w-16 h-auto" />
            <div className="ml-3 text-left text-sm text-white">
                <span className="mb-0.5 truncate leading-none font-semibold">Shin-Line cargo</span>
            </div>
        </div>
    );
}