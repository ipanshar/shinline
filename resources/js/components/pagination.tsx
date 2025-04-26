import { Button } from "@/components/ui/button";
type PaginationProps = {
    currentPage: number;
    lastPage: number;
    setPage: (page: number) => void;
};

const Pagination: React.FC<PaginationProps> = ({ currentPage, lastPage, setPage }) => {
    const maxVisiblePages = 8;
    const pages = [];

    // Первая страница
    pages.push(
        <Button key="first" className="px-3 py-2 mx-1 rounded bg-red-500 text-white hover:bg-red-600 font-bold"
                onClick={() => setPage(1)}>
          {"|<"}
        </Button>
    );

    // Страницы до `currentPage`
    for (let i = Math.max(1, currentPage - 3); i < currentPage; i++) {
        pages.push(
            <Button key={i} className="px-3 py-2 mx-1 rounded bg-red-500 text-white hover:bg-red-700"
                    onClick={() => setPage(i)}>
                {i}
            </Button>
        );
    }

    // Текущая страница
    pages.push(
        <Button key={currentPage} className="px-3 py-2 mx-1 rounded bg-red-300 text-white font-bold">
            {currentPage}
        </Button>
    );

    // Страницы после `currentPage`
    for (let i = currentPage + 1; i <= Math.min(lastPage, currentPage + 3); i++) {
        pages.push(
            <Button key={i} className="px-3 py-2 mx-1 rounded bg-red-500 text-white hover:bg-red-700"
                    onClick={() => setPage(i)}>
                {i}
            </Button>
        );
    }

    // Последняя страница
    pages.push(
        <Button key="last" className="px-3 py-2 mx-1 rounded bg-red-500 text-white hover:bg-red-700 font-bold"
                onClick={() => setPage(lastPage)}>
            {">|"}
        </Button>
    );

    return <div key="pagination" className="sticky bottom-0 w-full flex justify-center p-4 rounded-xl shadow-md"><div className="flex">{pages}</div></div>;
};

export default Pagination;